'use client';

import type { ComponentProps } from 'react';

import { cx } from '@/components/lort';

/** A Lort chip that can be a Radix menu trigger (forwards ref and every button prop). */
export function ChipButton({
  kind,
  className,
  ...rest
}: ComponentProps<'button'> & { kind: 'status' | 'board' | 'tag' | 'add' }) {
  return (
    <button
      type="button"
      className={cx('lt-chip', `lt-chip-${kind}`, kind === 'add' && 'lt-chip-square', className)}
      {...rest}
    />
  );
}
