import * as React from 'react';
import { Icon } from './Icon';
import { cx } from './utils';

export interface ToastProps {
  children: React.ReactNode;
  /** One action, e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** Seconds the action stays available; draws a thin countdown along the bottom edge. */
  countdown?: number;
  className?: string;
}

/** A short confirmation in past tense, with at most one action. Undo toasts show their countdown. */
export function Toast({ children, actionLabel, onAction, onDismiss, countdown, className }: ToastProps) {
  return (
    <div className={cx('lt-toast', className)} role="status">
      <span className="lt-toast-text">{children}</span>
      {actionLabel && (
        <button type="button" className="lt-toast-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button type="button" className="lt-toast-x" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" size={14} />
        </button>
      )}
      {countdown ? (
        <span className="lt-toast-timer" aria-hidden="true" style={{ animationDuration: `${countdown}s` }} />
      ) : null}
    </div>
  );
}
