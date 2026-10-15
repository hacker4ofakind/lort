import * as React from 'react';
import { cx } from './utils';

export interface SortOption {
  value: string;
  label: string;
}

export interface SortTabsProps {
  options?: SortOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  'aria-label'?: string;
  className?: string;
}

const DEFAULT_OPTIONS: SortOption[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'newest', label: 'Newest' },
];

/**
 * Segmented tabs whose ink indicator slides to the selected option.
 * The Next.js app animates the indicator with a Motion `layoutId`; this version measures and transitions.
 */
export function SortTabs({
  options = DEFAULT_OPTIONS,
  value,
  defaultValue,
  onValueChange,
  'aria-label': ariaLabel = 'Sort',
  className,
}: SortTabsProps) {
  const [own, setOwn] = React.useState(defaultValue ?? options[0]?.value);
  const selected = value ?? own;
  const trackRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [box, setBox] = React.useState({ x: 0, w: 0 });

  const measure = React.useCallback(() => {
    const i = options.findIndex((o) => o.value === selected);
    const el = tabRefs.current[i];
    if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [options, selected]);

  React.useLayoutEffect(measure, [measure]);
  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  const choose = (v: string) => {
    if (value === undefined) setOwn(v);
    onValueChange?.(v);
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    choose(options[next].value);
    tabRefs.current[next]?.focus();
  };

  return (
    <div ref={trackRef} className={cx('lt-tabs', className)} role="tablist" aria-label={ariaLabel}>
      <span className="lt-tabs-ind" aria-hidden="true" style={{ transform: `translateX(${box.x}px)`, width: box.w }} />
      {options.map((o, i) => {
        const on = o.value === selected;
        return (
          <button
            key={o.value}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className="lt-tab"
            onClick={() => choose(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
