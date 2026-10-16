import { headers } from 'next/headers';

import { DEFAULT_BRAND } from './brand-defaults';
import type { Brand } from './types';

export { DEFAULT_BRAND };

/** Parses the X-Lort-Config header the Go proxy adds to every page request. */
export function parseBrand(header: string | null): Brand {
  if (!header) return DEFAULT_BRAND;
  try {
    const raw = typeof atob === 'function' ? atob(header) : Buffer.from(header, 'base64').toString('utf8');
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
    return { ...DEFAULT_BRAND, ...value, features: { ...DEFAULT_BRAND.features, ...value.features } };
  } catch {
    return DEFAULT_BRAND;
  }
}

/** The board's branding for this request (server components only). */
export async function getBrand(): Promise<Brand> {
  return parseBrand((await headers()).get('x-lort-config'));
}
