'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { DEFAULT_BRAND } from '@/lib/brand-defaults';
import type { Brand } from '@/lib/types';

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

/** Hands the server-read branding (X-Lort-Config) to client components. */
export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}

/** The app's logo, or its first letter on the primary colour, tilted like a sticker. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const brand = useBrand();
  return (
    <span className="lt-mark" style={{ width: size, height: size, fontSize: size / 2 }} aria-hidden="true">
      {brand.logo ? <img src={brand.logo} alt="" /> : (brand.appName.trim()[0] ?? 'L').toUpperCase()}
    </span>
  );
}
