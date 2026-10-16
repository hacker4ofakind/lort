'use client';

import * as React from 'react';
import { Button } from './Button';
import type { IconName } from './Icon';
import { cx, type Status } from './utils';

export type TriageActionId =
  'close' | 'merge' | 'skip' | 'accept' | 'roadmap' | 'rereview' | 'start' | 'complete' | 'reopen';

export interface TriageAction {
  id: TriageActionId;
  label: string;
  icon?: IconName;
  tone: 'danger' | 'neutral' | 'quiet' | 'primary';
  /** Status the request moves to; undefined for Merge (opens a picker) and Skip (next request). */
  next?: Status;
}

const CLOSE: TriageAction = { id: 'close', label: 'Close', icon: 'x', tone: 'danger', next: 'closed' };
const MERGE: TriageAction = { id: 'merge', label: 'Merge', icon: 'merge', tone: 'neutral' };
const SKIP: TriageAction = { id: 'skip', label: 'Skip', icon: 'skip', tone: 'quiet' };

const ACTIONS: Record<Status, TriageAction[]> = {
  pending: [CLOSE, MERGE, SKIP, { id: 'accept', label: 'Accept', tone: 'primary', next: 'reviewing' }],
  reviewing: [CLOSE, MERGE, SKIP, { id: 'roadmap', label: 'Add to roadmap', tone: 'primary', next: 'planned' }],
  planned: [
    { id: 'rereview', label: 'Re-review', icon: 'rotate', tone: 'neutral', next: 'reviewing' },
    { id: 'start', label: 'Start working', tone: 'primary', next: 'progress' },
  ],
  progress: [{ id: 'complete', label: 'Complete', tone: 'primary', next: 'completed' }],
  completed: [{ id: 'reopen', label: 'Reopen', tone: 'primary', next: 'progress' }],
  closed: [{ id: 'reopen', label: 'Reopen', tone: 'primary', next: 'pending' }],
};

/** The actions the triage bar offers for a status, in display order. */
export function triageActions(status: Status): TriageAction[] {
  return ACTIONS[status];
}

export interface TriageBarProps {
  status: Status;
  onAction?: (action: TriageAction) => void;
  className?: string;
}

/** The floating action bar on a dashboard request page that moves the request to its next status. */
export function TriageBar({ status, onAction, className }: TriageBarProps) {
  return (
    <div className={cx('lt-bar', 'lt-triage', className)} role="toolbar" aria-label="Triage">
      {ACTIONS[status].map((a) => (
        <Button
          key={a.id}
          variant={a.tone === 'primary' ? 'primary' : a.tone === 'danger' ? 'danger' : 'ghost'}
          icon={a.icon}
          className={cx(a.tone === 'neutral' && 'lt-btn-neutral')}
          onClick={() => onAction?.(a)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}
