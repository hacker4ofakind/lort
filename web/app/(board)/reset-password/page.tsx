import { Suspense } from 'react';

import { ResetPassword } from '@/components/board/reset-password';

export const metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage() {
  return (
    <main className="lt-page" style={{ display: 'flex', justifyContent: 'center' }}>
      <Suspense>
        <ResetPassword />
      </Suspense>
    </main>
  );
}
