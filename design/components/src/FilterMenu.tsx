import * as React from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { cx } from './utils';

export interface FilterOption {
  value: string;
  label: string;
  /** Shown before the label, e.g. a StatusIcon. */
  icon?: React.ReactNode;
}

export interface FilterMenuProps {
  /** Trigger text when nothing (or everything) is selected: "All boards". */
  allLabel: string;
  /** Plural noun for several selections: "statuses" → "3 statuses". */
  noun: string;
  options: FilterOption[];
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (values: string[]) => void;
  /** Custom trigger text for a selection; return undefined to fall back to the default summary. */
  summarize?: (values: string[]) => string | undefined;
  /** Opens upward by default (the board's bottom bar). */
  placement?: 'up' | 'down';
  className?: string;
}

/** A multi-select filter behind a pill button: checkbox list with a Clear row at the bottom. */
export function FilterMenu({
  allLabel,
  noun,
  options,
  selected,
  defaultSelected = [],
  onSelectedChange,
  summarize,
  placement = 'up',
  className,
}: FilterMenuProps) {
  const [own, setOwn] = React.useState<string[]>(defaultSelected);
  const values = selected ?? own;
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const set = (next: string[]) => {
    if (selected === undefined) setOwn(next);
    onSelectedChange?.(next);
  };
  const toggle = (v: string) => set(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  const summary =
    summarize?.(values) ??
    (values.length === 0 || values.length === options.length
      ? allLabel
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label ?? allLabel
        : `${values.length} ${noun}`);

  return (
    <div ref={rootRef} className={cx('lt-filter', className)}>
      <Button
        variant="secondary"
        trailingIcon={placement === 'up' ? 'chevronUp' : 'chevronDown'}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        {summary}
      </Button>
      {open && (
        <div id={menuId} className={cx('lt-menu', `lt-menu-${placement}`)} role="group" aria-label={allLabel}>
          {options.map((o) => (
            <label key={o.value} className="lt-menu-item">
              <input type="checkbox" checked={values.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="lt-check" aria-hidden="true">
                <Icon name="check" size={12} strokeWidth={3} />
              </span>
              {o.icon}
              <span>{o.label}</span>
            </label>
          ))}
          <div className="lt-menu-foot">
            <button type="button" className="lt-menu-clear" onClick={() => set([])} disabled={values.length === 0}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
