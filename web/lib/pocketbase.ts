// Two PocketBase clients on the same origin, each with its own saved session:
// - pb: board users (the public site). When an admin opens the dashboard, their linked board
//   profile is signed in here too, so they comment, vote and suggest as that profile.
// - pbAdmin: superusers (the dashboard).
// Auto-cancellation is off: TanStack Query dedupes and cancels requests itself, and the SDK's
// own cancelling would abort legitimate parallel calls.
import PocketBase, { LocalAuthStore } from "pocketbase"

function client(storageKey: string) {
  const c = new PocketBase("/", new LocalAuthStore(storageKey))
  c.autoCancellation(false)
  return c
}

export const pb = client("lort_user")
export const pbAdmin = client("lort_admin")

export type Client = PocketBase
