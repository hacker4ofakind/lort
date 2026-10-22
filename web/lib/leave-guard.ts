// Client navigation fires no beforeunload, so a page with unsaved work (the changelog editor)
// registers a guard here and the dashboard's links await it before navigating.

type Guard = () => Promise<boolean>

let guard: Guard | null = null

/** Sets the guard; returns a function that removes it (if it is still the current one). */
export function setLeaveGuard(g: Guard): () => void {
  guard = g
  return () => {
    if (guard === g) guard = null
  }
}

/** Resolves true when it is fine to leave: nothing guarded, or the guard let go. */
export async function mayLeave(): Promise<boolean> {
  return guard ? guard() : true
}

export function hasLeaveGuard(): boolean {
  return guard !== null
}
