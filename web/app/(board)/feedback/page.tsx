import { Suspense } from 'react';

import { Feed } from '@/components/board/feed';
import { FeedSkeleton } from '@/components/board/skeletons';
import { PoweredBy } from '@/components/board/top-bar';
import { getBrand } from '@/lib/brand';

export default async function FeedbackPage() {
  const brand = await getBrand();
  return (
    <main className="lt-page">
      <h1 className="display-xl" style={{ margin: 0, textWrap: 'balance' }}>
        Got an idea for {brand.appName}?
      </h1>
      <p className="body-lg" style={{ margin: '12px 0 30px', color: 'var(--ink-2)', maxWidth: '60ch' }}>
        Stick a dot on the ones you want most. The team builds what gets the most dots, and tells you when it ships.
      </p>
      <Suspense fallback={<FeedSkeleton />}>
        <Feed />
      </Suspense>
      <PoweredBy />
    </main>
  );
}
