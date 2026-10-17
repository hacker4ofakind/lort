import { ClientResponseError } from "pocketbase"

const FALLBACK = "Something went wrong. Please try again."

/** A friendly, sentence-case message for any error from PocketBase or Lort. */
export function errorMessage(err: unknown, fallback = FALLBACK): string {
  if (!(err instanceof ClientResponseError)) return err instanceof Error && err.message ? err.message : fallback
  if (err.status === 429) return "Slow down a little. Try again in a minute."
  if (err.status === 0) return "Couldn't reach the board. Check your connection and try again."
  // Field errors ({ data: { title: { message } } }) name the actual problem.
  const fields = (err.response?.data ?? {}) as Record<string, { message?: string }>
  const first = Object.values(fields).find((f) => f?.message)?.message
  return first || err.response?.message || fallback
}

/** True for a request the client gave up on (navigation, unmount), which is not a failure. */
export function isAbort(err: unknown): boolean {
  return err instanceof ClientResponseError && err.isAbort
}

/** True when the server says the session is no longer valid. */
export function isAuthError(err: unknown): boolean {
  return err instanceof ClientResponseError && (err.status === 401 || err.status === 403)
}
