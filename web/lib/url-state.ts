'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type Patch = Record<string, string | string[] | null | undefined>;

/** Applies a patch to a query string. Empty values and empty lists remove the key. */
export function withParams(search: string, patch: Patch): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(patch)) {
    const text = Array.isArray(value) ? value.join(',') : value;
    if (text) params.set(key, text);
    else params.delete(key);
  }
  const out = params.toString();
  return out ? `?${out}` : '';
}

/** Reads a comma-separated list param; `fallback` when the key is absent. */
export function listParam(params: URLSearchParams, key: string, fallback: string[] = []): string[] {
  const raw = params.get(key);
  if (raw === null) return fallback;
  return raw.split(',').filter(Boolean);
}

/** Filters, sorts and search live in the URL so they survive reloads and can be shared. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = useCallback(
    (patch: Patch) => router.replace(pathname + withParams(params.toString(), patch), { scroll: false }),
    [router, pathname, params],
  );
  return { params, set };
}
