import { Suspense } from 'react';

import { AuthProvider } from '@/components/board/auth';
import { BrandProvider } from '@/components/board/brand';
import { TopBar } from '@/components/board/top-bar';
import { getBrand } from '@/lib/brand';

export default async function BoardLayout({ children }: LayoutProps<'/'>) {
  const brand = await getBrand();
  return (
    <BrandProvider brand={brand}>
      <AuthProvider>
        <Suspense>
          <TopBar />
        </Suspense>
        {children}
      </AuthProvider>
    </BrandProvider>
  );
}
