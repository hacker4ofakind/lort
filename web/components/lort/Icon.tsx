'use client';

import * as React from 'react';
import { cx } from './utils';

// Tabler outline paths (MIT). In the Next.js app import the same icons from @tabler/icons-react;
// this small set only exists so the design-system bundle needs nothing but React.
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  chevronUp: 'M6 15l6-6l6 6',
  chevronDown: 'M6 9l6 6l6-6',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M5 12l5 5l10-10',
  arrowUp: 'M12 5v14M18 11l-6-6M6 11l6-6',
  merge:
    'M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M5 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 8v8M7 8a4 4 0 0 0 4 4h4',
  skip: 'M4 5v14l12-7zM20 5v14',
  rotate: 'M19.95 11a8 8 0 1 0-.5 4M20 20v-5h-5',
  photo:
    'M15 8h.01M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 16l5-5c.93-.9 2.07-.9 3 0l5 5M14 14l1-1c.93-.9 2.07-.9 3 0l3 3',
  mic: 'M9 5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5 10a7 7 0 0 0 14 0M8 21h8M12 17v4',
  globe: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18',
  lock: 'M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0M8 11V7a4 4 0 1 1 8 0v4',
  message:
    'M3 20l1.3-3.9c-2.3-3.4-1.4-7.9 2.1-10.4c3.5-2.5 8.6-2.3 11.8.5c3.3 2.8 3.7 7.3 1 10.5c-2.7 3.2-7.6 4.2-11.6 2.3L3 20',
  search: 'M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-6-6',
  github:
    'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2c2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2a4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6c-.6.6-.6 1.2-.5 2V21',
  filter: 'M4 4h16v2.17a2 2 0 0 1-.59 1.42L15 12v7l-6 3v-8.5L4.52 8.57A2 2 0 0 1 4 7.23z',
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Give a label only when the icon is the sole content of its control. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth = 2, label, className }: IconProps) {
  return (
    <svg
      className={cx('lt-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
