'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

import { adminPb, userPb } from './pb';

function useRecord(pb: PocketBase): RecordModel | null {
  // LocalAuthStore parses its record from localStorage on every read, so the snapshot is a
  // string (stable between reads) and the record is rebuilt only when it changes.
  const snapshot = useSyncExternalStore(
    (onChange) => pb.authStore.onChange(onChange),
    () => (pb.authStore.isValid ? JSON.stringify(pb.authStore.record) : ''),
    () => '',
  );
  return useMemo(() => (snapshot ? (JSON.parse(snapshot) as RecordModel) : null), [snapshot]);
}

/** The signed-in board user (an admin's board profile counts), or null. */
export function useUser() {
  return useRecord(userPb);
}

/** The signed-in superuser, or null. */
export function useAdmin() {
  return useRecord(adminPb);
}

/** Signs a board user in. Throws a PocketBase error on bad credentials. */
export async function signIn(email: string, password: string) {
  await userPb.collection('users').authWithPassword(email, password);
}

/** Creates a board account and signs it in. `website` is the honeypot field: leave it empty. */
export async function signUp(email: string, password: string, website = '') {
  await userPb.collection('users').create({ email, password, passwordConfirm: password, website });
  await signIn(email, password);
}

/**
 * Signs an admin in to the dashboard, then signs them in on the board as their linked profile,
 * so their comments, votes and suggestions there carry their name and the Team badge.
 */
export async function signInAdmin(email: string, password: string) {
  await adminPb.collection('_superusers').authWithPassword(email, password);
  await refreshProfile();
}

/** True when the server turned the session down, as opposed to the request not getting through. */
export function isRejected(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 401 || status === 403;
}

/** Re-fetches the admin's board-profile token (it expires sooner than a dashboard session). */
export async function refreshProfile() {
  const me = await adminPb.send<{ profile: RecordModel; token: string }>('/api/lort/team/me', {});
  userPb.authStore.save(me.token, me.profile);
}

export function signOut() {
  userPb.authStore.clear();
}

export function signOutAdmin() {
  adminPb.authStore.clear();
  userPb.authStore.clear();
}
