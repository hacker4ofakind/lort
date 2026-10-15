import * as React from 'react';
import { Icon } from './Icon';
import { StatusIcon } from './StatusIcon';
import { cx, STATUS, type Status } from './utils';

export interface ChipProps {
  kind: 'status' | 'board' | 'tag' | 'add' | 'switch';
  /** For kind="status". */
  status?: Status;
  /** Visible text (board name, tag name, switch label). */
  label?: string;
  /** For kind="switch": controlled state. */
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Opens the editing menu in the dashboard. */
  onClick?: () => void;
  /** Public pages: render plain text, not a button. */
  interactive?: boolean;
  className?: string;
}

/** Small pills that show and edit a request's status, board, tags and visibility. */
export function Chip({
  kind,
  status = 'pending',
  label,
  checked,
  defaultChecked = true,
  onCheckedChange,
  onClick,
  interactive = true,
  className,
}: ChipProps) {
  const [own, setOwn] = React.useState(defaultChecked);
  const on = checked ?? own;
  const classes = cx('lt-chip', `lt-chip-${kind}`, kind === 'add' && 'lt-chip-square', className);

  let content: React.ReactNode;
  if (kind === 'status') content = <StatusIcon status={status} keyline showLabel size={18} />;
  else if (kind === 'add') content = <Icon name="plus" size={16} />;
  else if (kind === 'switch')
    content = (
      <>
        <Icon name="globe" size={16} />
        {label ?? 'On the board'}
        <span className={cx('lt-switch', on && 'is-on')} aria-hidden="true" />
      </>
    );
  else content = label;

  if (!interactive) return <span className={classes}>{content}</span>;

  if (kind === 'switch') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={classes}
        onClick={() => {
          if (checked === undefined) setOwn(!on);
          onCheckedChange?.(!on);
        }}
      >
        {content}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      aria-label={kind === 'add' ? label ?? 'Add tag' : kind === 'status' ? `Status: ${STATUS[status].label}` : undefined}
      aria-haspopup={onClick ? 'menu' : undefined}
    >
      {content}
    </button>
  );
}
