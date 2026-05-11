import { spawn, execSync } from "node:child_process"
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { RateLimitSnapshot, RateLimitResponse, UsageState } from "./types"

const CACHE_DIR = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "opencode-openai-usage")
const CACHE_FILE = join(CACHE_DIR, "last.json")
const CACHE_MAX_AGE_MS = 10 * 60 * 1000
const RPC_TIMEOUT_MS = 15_000

export function findCodexBinary(): string | null {
  try {
    return execSync("which codex", { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

export function fetchRateLimits(codexBinary: string): Promise<RateLimitSnapshot> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>

    try {
      child = spawn(codexBinary, ["app-server", "--listen", "stdio://"], {
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
        reject(new Error("Codex CLI not found. Install from https://openai.com/codex"))
      } else {
        reject(err)
      }
      return
    }

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error("Codex RPC timed out after 15s"))
    }, RPC_TIMEOUT_MS)

    let buffer = ""

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (err.code === "ENOENT") {
        reject(new Error("Codex CLI not found. Install from https://openai.com/codex"))
      } else {
        reject(err)
      }
    })

    child.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop()!

      for (const line of lines) {
        if (!line.trim()) continue
        let msg: { id?: number; result?: unknown }
        try {
          msg = JSON.parse(line)
        } catch {
          clearTimeout(timeout)
          child.kill()
          reject(new Error(`Malformed JSON from Codex RPC: ${line}`))
          return
        }

        if (msg.id === 1) {
          child.stdin!.write(JSON.stringify({ method: "initialized" }) + "\n")
          child.stdin!.write(JSON.stringify({ method: "account/rateLimits/read", id: 2 }) + "\n")
        } else if (msg.id === 2) {
          clearTimeout(timeout)
          child.kill()
          const response = msg.result as RateLimitResponse
          const snapshot = response?.rateLimits ?? ({} as RateLimitSnapshot)
          normalizeUsedPercent(snapshot)
          resolve(snapshot)
        }
      }
    })

    child.stdin!.write(
      JSON.stringify({
        method: "initialize",
        id: 1,
        params: {
          clientInfo: {
            name: "opencode_openai_usage",
            title: "OpenCode OpenAI Usage",
            version: "0.1.0",
          },
        },
      }) + "\n"
    )
  })
}

function normalizeUsedPercent(snapshot: RateLimitSnapshot): void {
  if (snapshot.primary && snapshot.primary.usedPercent != null) {
    if (snapshot.primary.usedPercent > 0 && snapshot.primary.usedPercent < 1) {
      snapshot.primary.usedPercent *= 100
    }
  }
  if (snapshot.secondary && snapshot.secondary.usedPercent != null) {
    if (snapshot.secondary.usedPercent > 0 && snapshot.secondary.usedPercent < 1) {
      snapshot.secondary.usedPercent *= 100
    }
  }
}

export function readCache(): RateLimitSnapshot | null {
  try {
    const raw = readFileSync(CACHE_FILE, "utf8")
    const cached = JSON.parse(raw) as { timestamp: number; data: RateLimitSnapshot }
    if (Date.now() - cached.timestamp > CACHE_MAX_AGE_MS) {
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

export function writeCache(data: RateLimitSnapshot): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    const tmpFile = `${CACHE_FILE}.${process.pid}.tmp`
    writeFileSync(tmpFile, JSON.stringify({ timestamp: Date.now(), data }), { mode: 0o600 })
    renameSync(tmpFile, CACHE_FILE)
  } catch {
    /* no-op */
  }
}

export function createRefreshLoop(
  setState: (s: UsageState) => void,
  intervalMs: number
): { start(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null
  let refreshing = false
  let lastData: RateLimitSnapshot | null = null
  let isFirstRun = true

  async function refresh(): Promise<void> {
    if (refreshing) return
    refreshing = true

    try {
      if (isFirstRun) {
        const cached = readCache()
        if (cached) {
          lastData = cached
          setState({ status: "success", data: cached, error: null })
        }
      }

      if (!lastData) {
        setState({ status: "loading", data: null, error: null })
      }

      const binary = findCodexBinary()
      if (!binary) {
        setState({ status: "not-configured", data: null, error: "Codex CLI not found" })
        return
      }

      const result = await fetchRateLimits(binary)
      lastData = result
      writeCache(result)
      setState({ status: "success", data: result, error: null })
    } catch (err) {
      setState({
        status: lastData ? "success" : "error",
        data: lastData,
        error: lastData ? null : String(err),
      })
    } finally {
      refreshing = false
      isFirstRun = false
    }
  }

  return {
    start(): void {
      if (timer !== null) return
      void refresh()
      timer = setInterval(() => void refresh(), intervalMs)
    },
    stop(): void {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
