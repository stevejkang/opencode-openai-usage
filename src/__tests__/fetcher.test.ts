import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { EventEmitter } from "node:events"

vi.mock("node:child_process")
vi.mock("node:fs")

import { execSync, spawn } from "node:child_process"
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs"
import { findCodexBinary, fetchUsageData, readCache, writeCache, createRefreshLoop } from "../fetcher"

function createMockProcess() {
  const stdin = { write: vi.fn() }
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
    pid: 1234,
  })
  return proc
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe("findCodexBinary", () => {
  it("returns path when codex is found", () => {
    ;(execSync as unknown as Mock).mockReturnValue("/usr/local/bin/codex\n")
    expect(findCodexBinary()).toBe("/usr/local/bin/codex")
  })

  it("returns null when codex is not found", () => {
    ;(execSync as unknown as Mock).mockImplementation(() => {
      throw new Error("not found")
    })
    expect(findCodexBinary()).toBeNull()
  })
})

describe("fetchUsageData", () => {
  it("sends RPC messages in correct handshake order", async () => {
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")

    await new Promise((r) => setTimeout(r, 0))

    expect(proc.stdin.write).toHaveBeenCalledTimes(1)
    const initCall = JSON.parse(proc.stdin.write.mock.calls[0][0].replace("\n", ""))
    expect(initCall.method).toBe("initialize")
    expect(initCall.id).toBe(1)

    proc.stdout.emit("data", Buffer.from(JSON.stringify({ id: 1, result: {} }) + "\n"))
    await new Promise((r) => setTimeout(r, 0))

    expect(proc.stdin.write).toHaveBeenCalledTimes(4)
    const initializedCall = JSON.parse(proc.stdin.write.mock.calls[1][0].replace("\n", ""))
    expect(initializedCall.method).toBe("initialized")
    expect(initializedCall.id).toBeUndefined()

    const rateLimitsCall = JSON.parse(proc.stdin.write.mock.calls[2][0].replace("\n", ""))
    expect(rateLimitsCall.method).toBe("account/rateLimits/read")
    expect(rateLimitsCall.id).toBe(2)

    const accountReadCall = JSON.parse(proc.stdin.write.mock.calls[3][0].replace("\n", ""))
    expect(accountReadCall.method).toBe("account/read")
    expect(accountReadCall.id).toBe(3)
    expect(accountReadCall.params).toEqual({})

    proc.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          id: 2,
          result: { rateLimits: { limitId: "test", primary: { usedPercent: 50 } } },
        }) + "\n"
      )
    )
    proc.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          id: 3,
          result: {
            account: { type: "chatgpt", email: "user@example.com", planType: "plus" },
            requiresOpenaiAuth: false,
          },
        }) + "\n"
      )
    )

    const result = await promise
    expect(result.snapshot.limitId).toBe("test")
    expect(result.snapshot.primary!.usedPercent).toBe(50)
    expect(result.profile).toEqual({ email: "user@example.com", planType: "plus" })
  })

  it("resolves with null profile after grace period when account/read never answers", async () => {
    vi.useFakeTimers()
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")

    proc.stdout.emit("data", Buffer.from(JSON.stringify({ id: 1, result: {} }) + "\n"))
    proc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: 2, result: { rateLimits: { limitId: "only" } } }) + "\n")
    )
    await vi.advanceTimersByTimeAsync(1_000)

    const result = await promise
    expect(result.snapshot.limitId).toBe("only")
    expect(result.profile).toBeNull()
    expect(proc.kill).toHaveBeenCalled()
  })

  it("ignores non-chatgpt accounts and RPC errors for profile", async () => {
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")

    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit("data", Buffer.from(JSON.stringify({ id: 1, result: {} }) + "\n"))
    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: 3, result: { account: { type: "apiKey" } } }) + "\n")
    )
    proc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: 2, result: { rateLimits: { limitId: "key" } } }) + "\n")
    )

    const result = await promise
    expect(result.snapshot.limitId).toBe("key")
    expect(result.profile).toBeNull()
  })

  it("treats account/read RPC error response as null profile", async () => {
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")

    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit("data", Buffer.from(JSON.stringify({ id: 1, result: {} }) + "\n"))
    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: 3, error: { code: -32600, message: "Invalid request" } }) + "\n")
    )
    proc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: 2, result: { rateLimits: { limitId: "err" } } }) + "\n")
    )

    const result = await promise
    expect(result.snapshot.limitId).toBe("err")
    expect(result.profile).toBeNull()
  })

  it("rejects with timeout after 15s", async () => {
    vi.useFakeTimers()
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")
    vi.advanceTimersByTime(15_000)

    await expect(promise).rejects.toThrow("Codex RPC timed out after 15s")
    expect(proc.kill).toHaveBeenCalled()
  })

  it("rejects with not-found message on ENOENT", async () => {
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/nonexistent/codex")

    const err = new Error("spawn ENOENT") as NodeJS.ErrnoException
    err.code = "ENOENT"
    proc.emit("error", err)

    await expect(promise).rejects.toThrow("Codex CLI not found")
  })

  it("rejects on malformed JSON from stdout", async () => {
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")

    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit("data", Buffer.from("not valid json\n"))

    await expect(promise).rejects.toThrow("Malformed JSON")
  })

  it("normalizes usedPercent from 0-1 range to 0-100", async () => {
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")

    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit("data", Buffer.from(JSON.stringify({ id: 1, result: {} }) + "\n"))
    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          id: 2,
          result: { rateLimits: { primary: { usedPercent: 0.75 }, secondary: { usedPercent: 0.3 } } },
        }) + "\n"
      )
    )
    proc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: 3, result: { account: null } }) + "\n")
    )

    const result = await promise
    expect(result.snapshot.primary!.usedPercent).toBe(75)
    expect(result.snapshot.secondary!.usedPercent).toBe(30)
  })

  it("does not normalize usedPercent of exactly 1 (already 0-100 scale)", async () => {
    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const promise = fetchUsageData("/usr/local/bin/codex")

    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit("data", Buffer.from(JSON.stringify({ id: 1, result: {} }) + "\n"))
    await new Promise((r) => setTimeout(r, 0))
    proc.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          id: 2,
          result: { rateLimits: { primary: { usedPercent: 1 }, secondary: { usedPercent: 1 } } },
        }) + "\n"
      )
    )
    proc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ id: 3, result: { account: null } }) + "\n")
    )

    const result = await promise
    expect(result.snapshot.primary!.usedPercent).toBe(1)
    expect(result.snapshot.secondary!.usedPercent).toBe(1)
  })
})

describe("readCache", () => {
  it("returns null when cache file is expired", () => {
    const oldTimestamp = Date.now() - 11 * 60 * 1000
    ;(readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({ timestamp: oldTimestamp, data: { limitId: "cached" } })
    )
    expect(readCache()).toBeNull()
  })

  it("returns data and profile when cache is fresh", () => {
    const freshTimestamp = Date.now() - 5 * 60 * 1000
    ;(readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({
        timestamp: freshTimestamp,
        data: { limitId: "cached" },
        profile: { email: "cached@example.com", planType: "plus" },
      })
    )
    const result = readCache()
    expect(result).not.toBeNull()
    expect(result!.data.limitId).toBe("cached")
    expect(result!.profile).toEqual({ email: "cached@example.com", planType: "plus" })
  })

  it("returns null profile for legacy cache without profile", () => {
    const freshTimestamp = Date.now() - 5 * 60 * 1000
    ;(readFileSync as unknown as Mock).mockReturnValue(
      JSON.stringify({ timestamp: freshTimestamp, data: { limitId: "cached" } })
    )
    const result = readCache()
    expect(result).not.toBeNull()
    expect(result!.data.limitId).toBe("cached")
    expect(result!.profile).toBeNull()
  })

  it("returns null on file read error", () => {
    ;(readFileSync as unknown as Mock).mockImplementation(() => {
      throw new Error("ENOENT")
    })
    expect(readCache()).toBeNull()
  })
})

describe("writeCache", () => {
  it("writes atomically via tmp file and rename", () => {
    ;(mkdirSync as unknown as Mock).mockReturnValue(undefined)
    ;(writeFileSync as unknown as Mock).mockReturnValue(undefined)
    ;(renameSync as unknown as Mock).mockReturnValue(undefined)

    writeCache({ limitId: "test" }, { email: "test@example.com", planType: "pro" })

    expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".tmp"),
      expect.any(String),
      { mode: 0o600 }
    )
    const written = JSON.parse((writeFileSync as unknown as Mock).mock.calls[0][1])
    expect(written.data.limitId).toBe("test")
    expect(written.profile).toEqual({ email: "test@example.com", planType: "pro" })
    expect(renameSync).toHaveBeenCalled()
  })

  it("silently ignores write errors", () => {
    ;(mkdirSync as unknown as Mock).mockImplementation(() => {
      throw new Error("EACCES")
    })
    expect(() => writeCache({ limitId: "test" }, null)).not.toThrow()
  })
})

describe("createRefreshLoop", () => {
  it("prevents concurrent fetches", async () => {
    vi.useFakeTimers()
    ;(execSync as unknown as Mock).mockReturnValue("/usr/local/bin/codex\n")
    ;(readFileSync as unknown as Mock).mockImplementation(() => {
      throw new Error("ENOENT")
    })

    let resolveRpc: (v: unknown) => void
    const rpcPromise = new Promise((r) => {
      resolveRpc = r
    })

    const proc = createMockProcess()
    ;(spawn as unknown as Mock).mockReturnValue(proc)

    const states: Array<{ status: string }> = []
    const loop = createRefreshLoop((s) => states.push(s), 30_000)

    loop.start()
    await vi.advanceTimersByTimeAsync(0)

    const spawnCallCount = (spawn as unknown as Mock).mock.calls.length

    vi.advanceTimersByTime(30_000)
    await vi.advanceTimersByTimeAsync(0)

    expect((spawn as unknown as Mock).mock.calls.length).toBe(spawnCallCount)

    loop.stop()
  })
})
