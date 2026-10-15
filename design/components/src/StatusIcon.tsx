import * as React from 'react';
import { cx, fillPath, STATUS, type Status } from './utils';

export interface StatusIconProps {
  status: Status;
  /** Pixel size of the circle. 14–20; 16 by default. */
  size?: number;
  /** Render the label beside the icon in ink (the label rule's "icon + label" form). */
  showLabel?: boolean;
  /** Add the light sticker edge used on public cards and timelines. */
  keyline?: boolean;
  className?: string;
}

/** The circle that shows where a request is, filled from the bottom as it moves toward Completed. */
export function StatusIcon({ status, size = 16, showLabel = false, keyline = false, className }: StatusIconProps) {
  const meta = STATUS[status];
  const ring = keyline ? 6.2 : 7;
  const inner = keyline ? 4.5 : 5.1;
  const svg = (
    <svg
      className={cx('lt-status-icon', !showLabel && className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ color: `var(--status-${status})` }}
      role={showLabel ? undefined : 'img'}
      aria-label={showLabel ? undefined : meta.label}
      aria-hidden={showLabel ? true : undefined}
    >
      {!showLabel && <title>{meta.label}</title>}
      {keyline && <circle cx="8" cy="8" r="7.6" className="lt-si-keyline" />}
      <circle cx="8" cy="8" r={ring} className="lt-si-ground" />
      <circle cx="8" cy="8" r={ring} className="lt-si-tint" />
      <circle cx="8" cy="8" r={ring} className="lt-si-ring" strokeWidth={keyline ? 1.3 : 1.5} />
      {meta.fill > 0 && <path d={fillPath(meta.fill, inner)} className="lt-si-fill" />}
      {status === 'completed' && <path d="M5.3 8.2l1.8 1.8l3.6-3.7" className="lt-si-glyph" />}
      {status === 'closed' && <path d="M6 6l4 4M10 6l-4 4" className="lt-si-glyph" />}
    </svg>
  );
  if (!showLabel) return svg;
  return (
    <span className={cx('lt-status', className)}>
      {svg}
      <span>{meta.label}</span>
    </span>
  );
}

export interface StatusTextProps {
  status: Status;
  className?: string;
}

/** A status as coloured text with no icon (the label rule's other form). */
export function StatusText({ status, className }: StatusTextProps) {
  return (
    <span className={cx('lt-status-text', className)} style={{ color: `var(--status-${status}-text)` }}>
      {STATUS[status].label}
    </span>
  );
}
