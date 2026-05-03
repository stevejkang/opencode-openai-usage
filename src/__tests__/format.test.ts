import {
  formatPercentage,
  formatRelativeTime,
  formatBar,
  formatWindowLabel,
  getPercentColor,
} from "../format"

describe("formatPercentage", () => {
  it("returns —% for null", () => {
    expect(formatPercentage(null)).toBe("—%")
  })

  it("returns —% for undefined", () => {
    expect(formatPercentage(undefined)).toBe("—%")
  })

  it("returns 0% for 0", () => {
    expect(formatPercentage(0)).toBe("0%")
  })

  it("returns 50% for 50", () => {
    expect(formatPercentage(50)).toBe("50%")
  })

  it("rounds 75.4 to 75%", () => {
    expect(formatPercentage(75.4)).toBe("75%")
  })

  it("rounds 99.6 to 100%", () => {
    expect(formatPercentage(99.6)).toBe("100%")
  })

  it("returns 100% for 100", () => {
    expect(formatPercentage(100)).toBe("100%")
  })
})

describe("formatRelativeTime", () => {
  it("returns — for null", () => {
    expect(formatRelativeTime(null)).toBe("—")
  })

  it("returns — for undefined", () => {
    expect(formatRelativeTime(undefined)).toBe("—")
  })

  it("returns — for past timestamp", () => {
    const pastUnix = Math.floor(Date.now() / 1000) - 3600
    expect(formatRelativeTime(pastUnix)).toBe("—")
  })

  it("returns 45m for 45 minutes in the future", () => {
    const futureUnix = Math.ceil(Date.now() / 1000) + 45 * 60
    expect(formatRelativeTime(futureUnix)).toBe("45m")
  })

  it("returns 3h 16m for 3h16m in the future", () => {
    const futureUnix = Math.ceil(Date.now() / 1000) + (3 * 60 + 16) * 60
    expect(formatRelativeTime(futureUnix)).toBe("3h 16m")
  })

  it("returns 4d 5h for 4d5h in the future", () => {
    const futureUnix = Math.ceil(Date.now() / 1000) + (4 * 24 + 5) * 3600
    expect(formatRelativeTime(futureUnix)).toBe("4d 5h")
  })
})

describe("formatBar", () => {
  it("returns all empty for null", () => {
    const result = formatBar(null)
    expect(result.filled).toBe("")
    expect(result.empty).toBe("░".repeat(14))
  })

  it("returns all empty for 0", () => {
    const result = formatBar(0)
    expect(result.filled).toBe("")
    expect(result.empty).toBe("░".repeat(14))
  })

  it("returns 7 filled and 7 empty for 50", () => {
    const result = formatBar(50)
    expect(result.filled).toBe("█".repeat(7))
    expect(result.empty).toBe("░".repeat(7))
  })

  it("returns all filled for 100", () => {
    const result = formatBar(100)
    expect(result.filled).toBe("█".repeat(14))
    expect(result.empty).toBe("")
  })

  it("respects custom width", () => {
    const result = formatBar(50, 10)
    expect(result.filled).toBe("█".repeat(5))
    expect(result.empty).toBe("░".repeat(5))
  })
})

describe("formatWindowLabel", () => {
  it("returns Session for 300", () => {
    expect(formatWindowLabel(300)).toBe("Session")
  })

  it("returns Weekly for 10080", () => {
    expect(formatWindowLabel(10080)).toBe("Weekly")
  })

  it("returns Unknown for null", () => {
    expect(formatWindowLabel(null)).toBe("Unknown")
  })

  it("returns Daily for 1440", () => {
    expect(formatWindowLabel(1440)).toBe("Daily")
  })
})

describe("getPercentColor", () => {
  it("returns defaultColor for null", () => {
    expect(getPercentColor(null, "#FFF")).toBe("#FFF")
  })

  it("returns defaultColor for 30", () => {
    expect(getPercentColor(30, "#FFF")).toBe("#FFF")
  })

  it("returns orange for 51", () => {
    expect(getPercentColor(51, "#FFF")).toBe("#F0A875")
  })

  it("returns red for 80", () => {
    expect(getPercentColor(80, "#FFF")).toBe("#E07A3A")
  })

  it("returns red for 100", () => {
    expect(getPercentColor(100, "#FFF")).toBe("#E07A3A")
  })
})
