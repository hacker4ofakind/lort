'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/lort';
import { BrandMark, useBrand } from '@/components/board/brand';
import { adminPb } from '@/lib/pb';
import { signInAdmin } from '@/lib/session';

/** Admin sign-in (design/canvas/D-Login.dc.html). */
export function LoginForm() {
  const brand = useBrand();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard/requests';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInAdmin(email.trim(), password);
      router.replace(next.startsWith('/dashboard') ? next : '/dashboard/requests');
    } catch {
      adminPb.authStore.clear();
      setError('That email and password don’t match an admin here.');
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="lt-dialog"
      style={{ width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <BrandMark size={44} />
      <div>
        <h1 className="title" style={{ margin: 0, fontSize: 26, lineHeight: '31px' }}>
          {brand.appName} dashboard
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 15, color: 'var(--ink-2)' }}>
          For the {brand.appName} team. Looking for the board?{' '}
          <Link href="/feedback" className="lt-link">
            Go to feedback
          </Link>
        </p>
      </div>
      <div>
        <label className="lt-label" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          className="lt-field"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="lt-label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          className="lt-field"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p className="lt-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
        Sign in
      </Button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
        Forgot it? On the server, run{' '}
        <code style={{ fontSize: 12, color: 'var(--ink-2)' }}>./setup.sh --reset-admin</code>
      </p>
    </form>
  );
}

/** Where an admin invite link lands: set a password, then sign in. */
export function InviteForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminPb.collection('_superusers').confirmPasswordReset(token, password, password);
      router.replace('/dashboard/login');
    } catch {
      setError('This invite has expired or was already used. Ask for a new one.');
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="lt-dialog"
      style={{ width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <h1 className="title" style={{ margin: 0, fontSize: 26, lineHeight: '31px' }}>
        Welcome to the team
      </h1>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>
        Choose a password for the dashboard. You’ll sign in with it next.
      </p>
      <div>
        <label className="lt-label" htmlFor="invite-password">
          Password
        </label>
        <input
          id="invite-password"
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
      {error && (
        <p className="lt-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" disabled={busy || !token} style={{ width: '100%' }}>
        Set password
      </Button>
    </form>
  );
}
