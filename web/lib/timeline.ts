import type { Comment, RequestDetail, TimelineEvent } from "@/lib/api"

export type TimelineEntry = { type: "event"; event: TimelineEvent } | { type: "comment"; comment: Comment }

/** Timeline entries and top-level comments together, newest first. Replies stay inside their comment, oldest first. */
export function buildTimeline(d: Pick<RequestDetail, "activity" | "thread">): TimelineEntry[] {
  const entries: Array<{ at: number; entry: TimelineEntry }> = [
    ...d.activity.map((event) => ({ at: Date.parse(event.created), entry: { type: "event" as const, event } })),
    ...d.thread.map((comment) => ({ at: Date.parse(comment.created), entry: { type: "comment" as const, comment } })),
  ]
  return entries.sort((a, b) => b.at - a.at).map((e) => e.entry)
}
