const BAR_WIDTH = 14
const FILLED_CHAR = "█"
const EMPTY_CHAR = "░"
const COLOR_RED = "#E07A3A"
const COLOR_ORANGE = "#F0A875"

export function formatPercentage(usedPercent: number | null | undefined): string {
  if (usedPercent == null) return "—%"
  return Math.round(usedPercent) + "%"
}

export function formatRelativeTime(resetsAt: number | null | undefined): string {
  if (resetsAt == null) return "—"
  const diffMs = resetsAt * 1000 - Date.now()
  if (diffMs <= 0) return "—"

  const totalMinutes = Math.floor(diffMs / 60000)
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return "—"
}

export function formatBar(
  usedPercent: number | null | undefined,
  width: number = BAR_WIDTH,
): { filled: string; empty: string } {
  if (usedPercent == null) {
    return { filled: "", empty: EMPTY_CHAR.repeat(width) }
  }
  const clamped = Math.max(0, Math.min(100, usedPercent))
  const filledCount = Math.round((clamped / 100) * width)
  return {
    filled: FILLED_CHAR.repeat(filledCount),
    empty: EMPTY_CHAR.repeat(width - filledCount),
  }
}

export function formatWindowLabel(windowDurationMins: number | null | undefined): string {
  if (windowDurationMins == null) return "Unknown"
  if (windowDurationMins === 300) return "Session"
  if (windowDurationMins === 10080) return "Weekly"
  if (windowDurationMins === 1440) return "Daily"
  if (windowDurationMins === 60) return "Hourly"
  return `${windowDurationMins}m`
}

export function getPercentColor(
  usedPercent: number | null | undefined,
  defaultColor: string,
): string {
  if (usedPercent == null) return defaultColor
  if (usedPercent >= 80) return COLOR_RED
  if (usedPercent >= 51) return COLOR_ORANGE
  return defaultColor
}
