import { Suspense } from 'react';

import { InviteForm } from '@/components/dashboard/login';

export const metadata = { title: 'Join the team' };

export default function InvitePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, boxSizing: 'border-box' }}>
      <Suspense>
        <InviteForm />
      </Suspense>
    </main>
  );
}
