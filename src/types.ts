// Rate limit window (from Codex RPC response)
export type RateLimitWindow = {
  usedPercent?: number | null
  windowDurationMins?: number | null
  resetsAt?: number | null  // Unix timestamp (seconds)
}

// Credits info (part of RPC response, not displayed)
export type RateLimitCredits = {
  hasCredits?: boolean
  unlimited?: boolean
  balance?: string | null
}

// Single rate limit snapshot
export type RateLimitSnapshot = {
  limitId?: string | null
  limitName?: string | null
  primary?: RateLimitWindow | null    // 5h Session
  secondary?: RateLimitWindow | null  // Weekly
  credits?: RateLimitCredits | null
  planType?: string | null
}

// Full RPC response
export type RateLimitResponse = {
  rateLimits?: RateLimitSnapshot | null
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null
}

// Account profile (from Codex RPC account/read)
export type AccountProfile = {
  email?: string | null
  planType?: string | null
}

// Raw account/read RPC response
export type AccountResponse = {
  account?:
    | { type?: "apiKey" | "chatgpt"; email?: string | null; planType?: string | null }
    | null
  requiresOpenaiAuth?: boolean
}

// Combined fetch result from a single Codex app-server session
export type UsageFetch = {
  snapshot: RateLimitSnapshot
  profile: AccountProfile | null
}

// Cached payload shape (profile absent in pre-email caches, treated as null)
export type CachePayload = {
  timestamp: number
  data: RateLimitSnapshot
  profile?: AccountProfile | null
}

// Plugin display state
export type FetchStatus = "idle" | "loading" | "success" | "error" | "not-configured"

export type UsageState = {
  status: FetchStatus
  data?: RateLimitSnapshot | null
  profile?: AccountProfile | null
  error?: string | null
}

// Plugin options (from tui.json config)
export type PluginOptions = {
  enabled?: boolean
  refreshInterval?: number       // seconds, default 30
  displayMode?: "text" | "bar"   // default "text"
  headerColor?: string           // hex, default "#E07A3A"
  valueColor?: string            // hex, default "#82AAFF"
  dimColor?: string              // hex, default "#546E7A"
}
