import { describe, expect, it } from "vitest"
import { queueLabel } from "@/components/dashboard/team-request"
import { changeMessage } from "@/components/dashboard/use-triage"
import { OPEN_STATUSES } from "@/lib/status"

describe("changeMessage", () => {
  it("names roadmap moves and completions, and stays quiet otherwise", () => {
    expect(changeMessage({ from: "reviewing", to: "planned", roadmap: "added" })).toBe("Added to the roadmap")
    expect(changeMessage({ from: "planned", to: "reviewing", roadmap: "removed" })).toBe("Taken off the roadmap")
    expect(changeMessage({ from: "progress", to: "completed", roadmap: "" })).toBe("Marked as completed")
    expect(changeMessage({ from: "pending", to: "reviewing", roadmap: "" })).toBeNull()
  })
})

describe("queueLabel", () => {
  it("names the queue", () => {
    expect(queueLabel(3, 12, ["reviewing"])).toBe("3 of 12 in Reviewing")
    expect(queueLabel(3, 40, OPEN_STATUSES)).toBe("3 of 40 open")
    expect(queueLabel(1, 2, ["pending", "closed"])).toBe("1 of 2")
    expect(queueLabel(0, 9, ["reviewing"])).toBe("Not in this list any more")
  })
})
