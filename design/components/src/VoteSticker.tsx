import * as React from 'react';
import { cx } from './utils';

export interface VoteStickerProps {
  /** Vote count from the server, including the viewer's vote when `voted` is true. */
  count: number;
  /** Controlled voted state. Leave undefined to let the sticker manage itself. */
  voted?: boolean;
  /** Initial state when uncontrolled. */
  defaultVoted?: boolean;
  onVotedChange?: (voted: boolean) => void;
  size?: 'md' | 'sm';
  /** Static display (public roadmap): no button, no hover. */
  readOnly?: boolean;
  /** What is being voted on, for the accessible name ("Dark mode for the editor"). */
  subject?: string;
  className?: string;
}

/** The upvote control: an empty dashed spot that becomes a sticker slapped onto the card. */
export function VoteSticker({
  count,
  voted,
  defaultVoted = false,
  onVotedChange,
  size = 'md',
  readOnly = false,
  subject,
  className,
}: VoteStickerProps) {
  const controlled = voted !== undefined;
  const [own, setOwn] = React.useState(defaultVoted);
  const [motion, setMotion] = React.useState<'' | 'slap' | 'peel'>('');
  const on = controlled ? voted : own;
  const shown = controlled ? count : count + (own ? 1 : 0) - (defaultVoted ? 1 : 0);
  const classes = cx('lt-vote', size === 'sm' && 'lt-vote-sm', on && 'is-voted', motion && `is-${motion}`, className);

  if (readOnly) {
    return (
      <span className={cx(classes, 'is-static')} aria-label={`${shown} votes`}>
        {shown}
      </span>
    );
  }

  const about = subject ? ` ${subject}` : '';
  const label = on ? `Remove your upvote from${about || ' this'}, ${shown} votes` : `Upvote${about}, ${shown} votes`;

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={on}
      aria-label={label}
      onClick={() => {
        const next = !on;
        setMotion(next ? 'slap' : 'peel');
        if (!controlled) setOwn(next);
        onVotedChange?.(next);
      }}
      onAnimationEnd={() => setMotion('')}
    >
      {shown}
    </button>
  );
}
