'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/lort';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { userPb } from '@/lib/pb';
import { signIn, signUp } from '@/lib/session';
import { useBrand } from './brand';

type Mode = 'signin' | 'signup';

interface AuthApi {
  /** Resolves true once someone is signed in, opening the sign-up step if needed. */
  requireUser: (mode?: Mode) => Promise<boolean>;
}

const AuthContext = createContext<AuthApi>({ requireUser: async () => false });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const qc = useQueryClient();

  const finish = useCallback(
    (ok: boolean) => {
      // Signing in changes what every list shows (votes, the viewer's own hidden requests).
      if (ok) void qc.invalidateQueries();
      resolver.current?.(ok);
      resolver.current = null;
      setMode(null);
    },
    [qc],
  );

  const requireUser = useCallback(async (start: Mode = 'signup') => {
    if (userPb.authStore.isValid) return true;
    resolver.current?.(false);
    setMode(start);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  return (
    <AuthContext.Provider value={{ requireUser }}>
      {children}
      <Dialog open={mode !== null} onOpenChange={(open) => !open && finish(false)}>
        {mode && <AuthForm mode={mode} onMode={setMode} onDone={() => finish(true)} />}
      </Dialog>
    </AuthContext.Provider>
  );
}

function AuthForm({ mode, onMode, onDone }: { mode: Mode; onMode: (m: Mode) => void; onDone: () => void }) {
  const brand = useBrand();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (signup) await signUp(email.trim(), password, website);
      else await signIn(email.trim(), password);
      onDone();
    } catch (err) {
      setError(signup ? errorMessage(err) : 'That email and password don’t match an account here.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent showCloseButton={false} className="lt-dialog max-w-[420px] gap-[18px] sm:max-w-[420px]">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <DialogTitle className="title" style={{ fontSize: 26, lineHeight: '31px' }}>
            {signup ? `Join the ${brand.appName} board` : 'Welcome back'}
          </DialogTitle>
          <DialogDescription style={{ margin: '8px 0 0', fontSize: 15, lineHeight: '22px', color: 'var(--ink-2)' }}>
            {signup
              ? `Suggest ideas, stick dots on the ones you want and hear when ${brand.appName} adds them.`
              : 'Sign in to suggest, vote and comment.'}
          </DialogDescription>
        </div>
        <div>
          <label className="lt-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="lt-field"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="lt-label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="lt-field"
            type="password"
            required
            minLength={8}
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signup && <p className="lt-hint">At least 8 characters.</p>}
        </div>
        <label className="lt-honeypot" aria-hidden="true">
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
        {error && (
          <p className="lt-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {signup ? 'Create account' : 'Sign in'}
        </Button>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          {signup ? 'Already have one? ' : 'New here? '}
          <button
            type="button"
            className="lt-link"
            style={{ all: 'unset', cursor: 'pointer', color: 'var(--primary-text)', fontWeight: 600 }}
            onClick={() => onMode(signup ? 'signin' : 'signup')}
          >
            {signup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        {!signup && !brand.features.email && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
            Forgot your password? Ask the {brand.appName} team for a reset link.
          </p>
        )}
      </form>
    </DialogContent>
  );
}
