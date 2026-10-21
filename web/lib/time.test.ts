import { describe, expect, it } from "vitest"
import { agoText, relativeTime, shortDate } from "@/lib/time"

const now = new Date("2026-10-16T12:00:00Z")

describe("time", () => {
  it("formats relative times", () => {
    expect(relativeTime("2026-10-16T11:59:30Z", now)).toBe("just now")
    expect(relativeTime("2026-10-16T11:55:00Z", now)).toBe("5 min ago")
    expect(relativeTime("2026-10-16T10:00:00Z", now)).toBe("2 hours ago")
    expect(relativeTime("2026-10-15T09:00:00Z", now)).toBe("yesterday")
    expect(relativeTime("2026-10-13T12:00:00Z", now)).toBe("3 days ago")
    expect(relativeTime("2026-10-02T12:00:00Z", now)).toBe("02 Oct")
  })

  it("adds the year outside the current one", () => {
    expect(shortDate("2025-03-04T12:00:00Z", now)).toBe("04 Mar 2025")
  })
})

describe("agoText", () => {
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

  it("keeps relativeTime under a week", () => {
    expect(agoText("2026-10-16T11:59:30Z", now)).toBe("just now")
    expect(agoText(daysAgo(1), now)).toBe("yesterday")
    expect(agoText(daysAgo(6), now)).toBe("6 days ago")
  })

  it("switches to weeks, months and years", () => {
    expect(agoText(daysAgo(7), now)).toBe("last week")
    expect(agoText(daysAgo(13), now)).toBe("last week")
    expect(agoText(daysAgo(14), now)).toBe("2 weeks ago")
    expect(agoText(daysAgo(29), now)).toBe("4 weeks ago")
    expect(agoText(daysAgo(30), now)).toBe("last month")
    expect(agoText(daysAgo(59), now)).toBe("last month")
    expect(agoText(daysAgo(65), now)).toBe("2 months ago")
    expect(agoText(daysAgo(340), now)).toBe("11 months ago")
    expect(agoText(daysAgo(400), now)).toBe("over a year ago")
  })
})
