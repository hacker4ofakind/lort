'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import { Toast } from '@/components/lort';

export interface ToastInput {
  message: string;
  /** At most one action, e.g. Undo. */
  action?: { label: string; onAction: () => void };
  /** Seconds the action stays available; draws the countdown bar and sets how long the toast stays. */
  countdown?: number;
}

interface Shown extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Shows a toast: a short past-tense confirmation with at most one action. */
export function useToast() {
  return useContext(ToastContext);
}

/** Holds the toast stack above the floating bars, newest at the bottom, three at most. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Shown[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = next.current++;
      setToasts((all) => [...all, { ...t, id }].slice(-3));
      setTimeout(() => dismiss(id), (t.countdown ?? 5) * 1000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 104,
          zIndex: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <Toast
              actionLabel={t.action?.label}
              countdown={t.countdown}
              onAction={() => {
                t.action?.onAction();
                dismiss(t.id);
              }}
              onDismiss={() => dismiss(t.id)}
            >
              {t.message}
            </Toast>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
