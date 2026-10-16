'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/lort';
import { userPb } from '@/lib/pb';

/** Where a password reset link (from the team, or by email in phase 3) lands. */
export function ResetPassword() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('busy');
    try {
      await userPb.collection('users').confirmPasswordReset(token, password, password);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <section
      className="lt-dialog"
      style={{ width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <h1 className="title" style={{ margin: 0, fontSize: 26, lineHeight: '31px' }}>
        {state === 'done' ? 'Password changed' : 'Choose a new password'}
      </h1>
      {state === 'done' ? (
        <>
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>You can sign in with it now.</p>
          <Link href="/feedback" className="lt-link">
            Back to the board
          </Link>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="lt-label" htmlFor="reset-password">
              New password
            </label>
            <input
              id="reset-password"
              className="lt-field"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="lt-hint">At least 8 characters.</p>
          </div>
          {state === 'failed' && (
            <p className="lt-error" role="alert">
              This link has expired or was already used. Ask the team for a new one.
            </p>
          )}
          <Button variant="primary" type="submit" disabled={state === 'busy' || !token} style={{ width: '100%' }}>
            Save password
          </Button>
        </form>
      )}
    </section>
  );
}
