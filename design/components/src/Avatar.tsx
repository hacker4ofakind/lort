import * as React from 'react';
import { cx } from './utils';

// Decorative fills for initials avatars. Never status colours; dark initials read on all of them.
const FILLS = ['#3ba3a0', '#e0a84b', '#8db4f2', '#c99ae8', '#7fcb8f', '#e88f7f'];

function fillFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FILLS[h % FILLS.length];
}

export interface AvatarProps {
  name: string;
  /** Uploaded picture. Falls back to the initial on a decorative fill. */
  src?: string;
  size?: number;
  /** Marks a team member (admin) with a primary ring and a "Team" accessible name. */
  team?: boolean;
  /** Add the sticker keyline (public pages, voter stacks). */
  keyline?: boolean;
  className?: string;
}

/** A person: their picture, or the first letter of their display name on a warm fill. */
export function Avatar({ name, src, size = 24, team = false, keyline = false, className }: AvatarProps) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <span
      className={cx('lt-avatar', keyline && 'has-keyline', team && 'is-team', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46), background: src ? undefined : fillFor(name) }}
      role="img"
      aria-label={team ? `${name} (team)` : name}
    >
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{initial}</span>}
    </span>
  );
}
