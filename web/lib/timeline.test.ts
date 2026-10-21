import { describe, expect, it } from "vitest"
import type { Comment, TimelineEvent } from "@/lib/api"
import { buildTimeline } from "@/lib/timeline"

describe("buildTimeline", () => {
  it("interleaves events and comments, newest first", () => {
    const ev = (id: string, created: string) => ({ id, kind: "status_changed", created }) as TimelineEvent
    const cm = (id: string, created: string) => ({ id, created, replies: [] }) as unknown as Comment
    const t = buildTimeline({
      activity: [ev("posted", "2026-10-11T10:00:00Z"), ev("moved", "2026-10-15T10:00:00Z")],
      thread: [cm("mara", "2026-10-13T10:00:00Z"), cm("devon", "2026-10-14T10:00:00Z")],
    })
    expect(t.map((e) => (e.type === "event" ? e.event.id : e.comment.id))).toEqual(["moved", "devon", "mara", "posted"])
  })

  it("shows a status change above the post it followed when both share a time", () => {
    const ev = (id: string, kind: string) => ({ id, kind, created: "2026-10-15T10:00:00.123Z" }) as TimelineEvent
    // The server sends activity oldest first, so on a tie the later row is the newer one.
    const t = buildTimeline({ activity: [ev("posted", "created"), ev("planned", "status_changed")], thread: [] })
    expect(t.map((e) => (e.type === "event" ? e.event.id : e.comment.id))).toEqual(["planned", "posted"])
  })
})
