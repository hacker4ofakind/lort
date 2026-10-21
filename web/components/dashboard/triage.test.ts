import { beforeEach, describe, expect, it, vi } from "vitest"
import { queueLabel } from "@/components/dashboard/team-request"
import { changeMessage, completionToast, UNDO_SECONDS } from "@/components/dashboard/use-triage"
import { undoToast } from "@/components/lort/undo-toast"
import { OPEN_STATUSES } from "@/lib/status"

describe("changeMessage", () => {
  it("names roadmap moves and completions, and stays quiet otherwise", () => {
    expect(changeMessage({ from: "reviewing", to: "planned", roadmap: "added" })).toBe("Added to the roadmap")
    expect(changeMessage({ from: "planned", to: "reviewing", roadmap: "removed" })).toBe("Taken off the roadmap")
    expect(changeMessage({ from: "progress", to: "completed", roadmap: "" })).toBe("Marked as completed")
    expect(changeMessage({ from: "pending", to: "reviewing", roadmap: "" })).toBeNull()
  })
})

vi.mock("@/components/lort/undo-toast", () => ({ undoToast: vi.fn() }))

describe("completionToast", () => {
  beforeEach(() => vi.mocked(undoToast).mockClear())
  const done = { from: "progress", to: "completed", roadmap: "" } as const

  it("says Marked as completed without a title, and names the request with one", () => {
    const onUndo = vi.fn()
    completionToast({ change: done, onUndo })
    expect(undoToast).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Marked as completed", seconds: UNDO_SECONDS, onUndo }))
    completionToast({ title: "Dark mode", change: done, onUndo, id: "r1" })
    expect(undoToast).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Marked “Dark mode” as completed", id: "r1" }))
  })

  it("mentions the emails when they are on, and does nothing for other changes", () => {
    completionToast({ change: done, onUndo: vi.fn(), email: true })
    expect(undoToast).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Marked as completed. People will hear about it in a minute." }))
    vi.mocked(undoToast).mockClear()
    completionToast({ change: { from: "completed", to: "progress", roadmap: "" }, onUndo: vi.fn() })
    expect(undoToast).not.toHaveBeenCalled()
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
