import { ClientResponseError } from 'pocketbase';

const FALLBACK = 'Something went wrong. Your changes are still here, so try again.';

/** A friendly, specific message for any failed call. */
export function errorMessage(err: unknown): string {
  if (err instanceof ClientResponseError) {
    if (err.status === 0) return "Can't reach the board. Check your connection and try again.";
    if (err.status === 429) return "You're going a bit fast. Try again in a minute.";
    const data = err.response?.data as Record<string, { message?: string }> | undefined;
    const field = data && Object.values(data).find((f) => f?.message)?.message;
    const message = (err.response?.message as string | undefined) || field;
    if (message && !/^Failed to|^Something went wrong while processing/.test(message)) return message;
    if (field) return field;
    if (err.status === 404) return 'That page is gone.';
    if (err.status === 401 || err.status === 403) return 'Sign in again to do that.';
  }
  return FALLBACK;
}
