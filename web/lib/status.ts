// Statuses and triage actions. Mirrors server/internal/status; the server is the authority.

export type Status = "pending" | "reviewing" | "planned" | "progress" | "completed" | "closed"

export const STATUSES: Status[] = ["pending", "reviewing", "planned", "progress", "completed", "closed"]

/** Still in play: the default status filter on the board and in the dashboard. */
export const OPEN_STATUSES: Status[] = ["pending", "reviewing", "planned", "progress"]

/** Label and fill level (0–1) of each status. The fill rises from the bottom of the circle. */
export const STATUS_META: Record<Status, { label: string; fill: number }> = {
  pending: { label: "Pending", fill: 0 },
  reviewing: { label: "Reviewing", fill: 0.28 },
  planned: { label: "Planned", fill: 0.5 },
  progress: { label: "In progress", fill: 0.8 },
  completed: { label: "Completed", fill: 1 },
  closed: { label: "Closed", fill: 1 },
}

export function isStatus(v: string): v is Status {
  return (STATUSES as string[]).includes(v)
}

/** Server action ids (POST /api/lort/requests/{id}/status), plus merge and skip, which aren't status changes. */
export type TriageActionId =
  | "close"
  | "merge"
  | "skip"
  | "accept"
  | "roadmap"
  | "rereview"
  | "start"
  | "complete"
  | "reopen"

export interface TriageAction {
  id: TriageActionId
  label: string
  icon?: "x" | "merge" | "skip" | "rotate"
  tone: "danger" | "neutral" | "quiet" | "primary"
  /** The status it moves to; undefined for merge (opens a picker) and skip (opens the next request). */
  next?: Status
}

const CLOSE: TriageAction = { id: "close", label: "Close", icon: "x", tone: "danger", next: "closed" }
const MERGE: TriageAction = { id: "merge", label: "Merge", icon: "merge", tone: "neutral" }
const SKIP: TriageAction = { id: "skip", label: "Skip", icon: "skip", tone: "quiet" }

const ACTIONS: Record<Status, TriageAction[]> = {
  pending: [CLOSE, MERGE, SKIP, { id: "accept", label: "Accept", tone: "primary", next: "reviewing" }],
  reviewing: [CLOSE, MERGE, SKIP, { id: "roadmap", label: "Add to roadmap", tone: "primary", next: "planned" }],
  planned: [
    { id: "rereview", label: "Re-review", icon: "rotate", tone: "neutral", next: "reviewing" },
    { id: "start", label: "Start working", tone: "primary", next: "progress" },
  ],
  progress: [{ id: "complete", label: "Complete", tone: "primary", next: "completed" }],
  completed: [{ id: "reopen", label: "Reopen", tone: "primary", next: "progress" }],
  closed: [{ id: "reopen", label: "Reopen", tone: "primary", next: "pending" }],
}

/** The triage bar's actions for a status, left to right; the last is the primary. */
export function triageActions(status: Status): TriageAction[] {
  return ACTIONS[status]
}

/** The status changes on offer from the dashboard's status chip: the triage moves without merge and skip. */
export function statusMoves(status: Status): TriageAction[] {
  return ACTIONS[status].filter((a) => a.next)
}
