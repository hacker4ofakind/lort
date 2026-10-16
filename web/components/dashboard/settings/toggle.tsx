'use client';

import { cx } from '@/components/lort';

/** The Lort switch (DESIGN.md): a pill track with a knob, primary when on. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sw"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className={cx('lt-switch', checked && 'is-on')} aria-hidden="true" />
    </button>
  );
}
