// The two PocketBase clients. Board users (and admins acting as their board profile) use
// userPb; the dashboard's superuser session lives in adminPb. Both talk to the same origin,
// where the Go server serves PocketBase and /api/lort.
import PocketBase, { LocalAuthStore } from 'pocketbase';

function client(storageKey: string) {
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const pb = new PocketBase(base, new LocalAuthStore(storageKey));
  // TanStack Query dedupes requests itself; PocketBase's auto-cancel would abort its refetches.
  pb.autoCancellation(false);
  return pb;
}

export const userPb = client('lort_user');
export const adminPb = client('lort_admin');

/** URL of a stored file. Protected files (hidden requests' images) need a file token. */
export function fileUrl(collection: string, recordId: string, name: string, token?: string) {
  const url = `/api/files/${collection}/${recordId}/${encodeURIComponent(name)}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export function avatarUrl(person: { id: string; avatar: string }) {
  return person.avatar ? fileUrl('users', person.id, person.avatar) : undefined;
}
