import { Suspense } from 'react';

import { LoginForm } from '@/components/dashboard/login';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, boxSizing: 'border-box' }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
