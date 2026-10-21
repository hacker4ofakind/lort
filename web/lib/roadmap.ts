// The roadmap's three columns: their copy, the "when" line on a card, the optimistic move and
// the remembered collapsed columns. The public page, the dashboard board and the tests share it.
import type { RequestItem, Roadmap, RoadmapStatus } from "@/lib/api"
import { agoText, shortDate } from "@/lib/time"

export interface RoadmapColumn {
  status: RoadmapStatus
  label: string
  /** The line under the public column's title. */
  blurb: string
  /** The public page's empty column. */
  emptyPublic: string
  /** The dashboard's drop hint while a card is over the column. */
  dropHint: string
  /** What "when" says about a card here: "Planned 3 weeks ago". */
  verb: string
}

export const ROADMAP_COLUMNS: RoadmapColumn[] = [
  {
    status: "planned",
    label: "Planned",
    blurb: "Committed and up next.",
    emptyPublic: "Nothing planned yet. The ideas with the most dots get here first.",
    dropHint: "Drop to plan it",
    verb: "Planned",
  },
  {
    status: "progress",
    label: "In progress",
    blurb: "Being built right now.",
    emptyPublic: "Nothing being built right now.",
    dropHint: "Drop to start working on it",
    verb: "Started",
  },
  {
    status: "completed",
    label: "Completed",
    blurb: "Shipped in the last 30 days.",
    emptyPublic: "Nothing shipped in the last 30 days.",
    dropHint: "Drop to mark it completed",
    verb: "Shipped",
  },
]

export const ROADMAP_ORDER: RoadmapStatus[] = ROADMAP_COLUMNS.map((c) => c.status)

export function columnOf(status: RoadmapStatus): RoadmapColumn {
  return ROADMAP_COLUMNS.find((c) => c.status === status)!
}

export function isRoadmapStatus(v: unknown): v is RoadmapStatus {
  return typeof v === "string" && (ROADMAP_ORDER as string[]).includes(v)
}

/** "Planned 3 weeks ago", "Started 4 days ago", "Shipped 09 Oct". */
export function whenText(item: Pick<RequestItem, "statusChangedAt">, column: RoadmapStatus, now = new Date()): string {
  const verb = columnOf(column).verb
  return column === "completed"
    ? `${verb} ${shortDate(item.statusChangedAt, now)}`
    : `${verb} ${agoText(item.statusChangedAt, now)}`
}

/** True when a goes above b in Planned and In progress: more votes first, then the newer request. */
function ranksAbove(a: RequestItem, b: RequestItem): boolean {
  return a.votes !== b.votes ? a.votes > b.votes : Date.parse(a.created) > Date.parse(b.created)
}

/**
 * The roadmap with card id moved into column `to`, at its sorted place: Planned and In progress
 * by votes, Completed at the top (it just shipped). Pure: the roadmap you pass is never changed,
 * so it can be reapplied over fresh data. An unknown card, or one already in `to`, gives the
 * same object back.
 */
export function moveCard(r: Roadmap, id: string, to: RoadmapStatus, now: Date): Roadmap {
  const from = ROADMAP_ORDER.find((s) => r[s].some((i) => i.id === id))
  if (!from || from === to) return r

  const card = { ...r[from].find((i) => i.id === id)!, status: to, statusChangedAt: now.toISOString() }
  const next: Roadmap = { ...r, [from]: r[from].filter((i) => i.id !== id) }
  const target = r[to]
  let at = 0
  if (to !== "completed") {
    at = target.findIndex((i) => ranksAbove(card, i))
    if (at === -1) at = target.length
  }
  next[to] = [...target.slice(0, at), card, ...target.slice(at)]
  if (to === "completed") next.shipped = r.shipped + 1
  else if (from === "completed") next.shipped = Math.max(0, r.shipped - 1)
  return next
}

export const COLLAPSED_KEY = "lort_roadmap_collapsed"

/** The collapsed statuses in a stored string. Anything unreadable, unknown or repeated is dropped. */
export function parseCollapsed(raw: string | null): RoadmapStatus[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]")
    if (!Array.isArray(v)) return []
    return [...new Set(v.filter(isRoadmapStatus))]
  } catch {
    return []
  }
}

/** The stored string as it is, "[]" when there is none or storage is blocked. Components subscribe to this. */
export function readCollapsedRaw(): string {
  try {
    return localStorage.getItem(COLLAPSED_KEY) ?? "[]"
  } catch {
    return "[]"
  }
}

export function readCollapsed(): RoadmapStatus[] {
  return parseCollapsed(readCollapsedRaw())
}

export function writeCollapsed(statuses: RoadmapStatus[]) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(statuses))
  } catch {
    // Private windows and blocked storage just forget it.
  }
}
