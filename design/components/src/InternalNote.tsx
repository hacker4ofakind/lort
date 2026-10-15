import * as React from 'react';
import { Icon } from './Icon';
import { cx } from './utils';

export interface InternalNoteProps {
  author: string;
  /** Relative time, e.g. "1 hour ago". */
  time: string;
  children: React.ReactNode;
  className?: string;
}

/** A comment only admins can see, set apart so nobody mistakes it for a public reply. */
export function InternalNote({ author, time, children, className }: InternalNoteProps) {
  return (
    <div className={cx('lt-note', className)}>
      <div className="lt-note-head">
        <b>{author}</b>
        <span className="lt-note-label">
          <Icon name="lock" size={13} />
          Only the team sees this
        </span>
        <span className="lt-note-time">· {time}</span>
      </div>
      <div className="lt-note-body">{children}</div>
    </div>
  );
}
