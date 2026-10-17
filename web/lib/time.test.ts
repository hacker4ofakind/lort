import { describe, expect, it } from "vitest"
import { relativeTime, shortDate } from "@/lib/time"

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
