/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import type { TuiPlugin, TuiPluginModule, TuiSlotContext } from "@opencode-ai/plugin/tui"
import type { UsageState, PluginOptions } from "./types"
import { createRefreshLoop } from "./fetcher"
import { formatRelativeTime, formatPercentage, formatBar, formatWindowLabel, getPercentColor } from "./format"

const OPENAI_GREEN = "#10A37F"
const DEFAULT_REFRESH_INTERVAL_S = 30
const EXPECTED_LOAD_S = 15

const tui: TuiPlugin = async (api, rawOptions, _meta) => {
  const options = (rawOptions as PluginOptions | undefined) ?? {}
  const refreshIntervalMs = (options.refreshInterval ?? DEFAULT_REFRESH_INTERVAL_S) * 1000
  const displayMode = options.displayMode ?? "text"

  const [state, setState] = createSignal<UsageState>({ status: "idle", data: null, error: null })
  const [open, setOpen] = createSignal(true)
  const [countdown, setCountdown] = createSignal(EXPECTED_LOAD_S)
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const wrappedSetState = (s: UsageState) => {
    if (s.status === "loading" && !s.data) {
      setCountdown(EXPECTED_LOAD_S)
      if (!tickTimer) {
        tickTimer = setInterval(() => {
          setCountdown((prev) => Math.max(0, prev - 1))
        }, 1000)
      }
    } else if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
    setState(s)
  }

  const loop = createRefreshLoop(wrappedSetState, refreshIntervalMs)
  loop.start()

  api.lifecycle.onDispose(() => {
    loop.stop()
    if (tickTimer) clearInterval(tickTimer)
  })

  api.slots.register({
    order: 50,
    slots: {
      sidebar_content(ctx: TuiSlotContext, _props: unknown) {
        const t = ctx.theme.current
        const dim = options.dimColor ?? t.textMuted ?? "#546E7A"
        const fg = options.headerColor ?? t.text ?? "#EEFFFF"
        const valueFg = options.valueColor ?? "#82AAFF"

        const s = state()

        // not-configured: Codex CLI not found
        if (s.status === "not-configured") {
          return (
            <box flexDirection="column">
              <box height={1}><text fg={OPENAI_GREEN}><b>{"OpenAI Usage"}</b></text></box>
              <box height={1}><text fg={dim}>{"Codex CLI not found"}</text></box>
            </box>
          ) as any
        }

        // error with no data
        if (s.status === "error" && !s.data) {
          return (
            <box flexDirection="column">
              <box height={1}><text fg={OPENAI_GREEN}><b>{"OpenAI Usage"}</b></text></box>
              <box height={1}><text fg={dim}>{"Failed to fetch usage"}</text></box>
            </box>
          ) as any
        }

        // loading/idle with no data yet
        if ((s.status === "idle" || s.status === "loading") && !s.data) {
          const remaining = countdown()
          const msg = remaining > 0 ? `Loading in ${remaining}s...` : "Loading shortly..."
          return (
            <box flexDirection="column">
              <box height={1}><text fg={OPENAI_GREEN}><b>{"OpenAI Usage"}</b></text></box>
              <box height={1}><text fg={dim}>{msg}</text></box>
            </box>
          ) as any
        }

        const data = s.data
        const isOpen = open()

        return (
          <box flexDirection="column">
            <box height={1} flexDirection="row" onMouseDown={() => setOpen(!open())}>
              <text fg={OPENAI_GREEN}>
                <b>{isOpen ? "\u25BC" : "\u25B6"}{" OpenAI Usage"}</b>
              </text>
            </box>

            {isOpen ? (
              <box flexDirection="column">
                {data ? (
                  <box flexDirection="column">
                    {/* Session (primary, 5h) */}
                    {data.primary ? (() => {
                      const w = data.primary
                      const pct = w.usedPercent ?? null
                      const label = formatWindowLabel(w.windowDurationMins)
                      const pctColor = getPercentColor(pct, valueFg)
                      if (displayMode === "bar") {
                        const bar = formatBar(pct)
                        const resetStr = formatRelativeTime(w.resetsAt)
                        const resetSuffix = resetStr && resetStr !== "—" ? ` (${resetStr})` : ""
                        return (
                          <box height={1} flexDirection="row">
                            <text fg={fg}>{` ${label.padEnd(8)}`}</text>
                            <text fg={pctColor}>{bar.filled + bar.empty + formatPercentage(pct).padStart(4)}</text>
                            <text fg={dim}>{resetSuffix}</text>
                          </box>
                        )
                      }
                      const resetStr = formatRelativeTime(w.resetsAt)
                      return (
                        <box height={1} flexDirection="row">
                          <text fg={fg}>{` ${label.padEnd(9)}`}</text>
                          <text fg={pctColor}>{formatPercentage(pct).padStart(5)}</text>
                          <text fg={dim}>{`  resets in ${resetStr}`}</text>
                        </box>
                      )
                    })() : null}

                    {/* Weekly (secondary, 7d) */}
                    {data.secondary ? (() => {
                      const w = data.secondary
                      const pct = w.usedPercent ?? null
                      const label = formatWindowLabel(w.windowDurationMins)
                      const pctColor = getPercentColor(pct, valueFg)
                      if (displayMode === "bar") {
                        const bar = formatBar(pct)
                        const resetStr = formatRelativeTime(w.resetsAt)
                        const resetSuffix = resetStr && resetStr !== "—" ? ` (${resetStr})` : ""
                        return (
                          <box height={1} flexDirection="row">
                            <text fg={fg}>{` ${label.padEnd(8)}`}</text>
                            <text fg={pctColor}>{bar.filled + bar.empty + formatPercentage(pct).padStart(4)}</text>
                            <text fg={dim}>{resetSuffix}</text>
                          </box>
                        )
                      }
                      const resetStr = formatRelativeTime(w.resetsAt)
                      return (
                        <box height={1} flexDirection="row">
                          <text fg={fg}>{` ${label.padEnd(9)}`}</text>
                          <text fg={pctColor}>{formatPercentage(pct).padStart(5)}</text>
                          <text fg={dim}>{`  resets in ${resetStr}`}</text>
                        </box>
                      )
                    })() : null}
                  </box>
                ) : null}
              </box>
            ) : null}
          </box>
        ) as any
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-openai-usage",
  tui,
}

export default plugin
