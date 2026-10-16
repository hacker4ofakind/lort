'use client';

import type { ReactNode } from 'react';

import { Button, StatusIcon, STATUS, STATUS_ORDER, Icon } from '@/components/lort';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { Ref } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boards: Ref[];
  board: string[];
  status: string[];
  onChange: (patch: { board?: string[]; status?: string[] }) => void;
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Phones: both filters in one bottom sheet, opened from the compact floating bar. */
export function FilterSheet({ open, onOpenChange, boards, board, status, onChange }: Props) {
  const row = (checked: boolean, onToggle: () => void, label: ReactNode, key: string) => (
    <label key={key} className="lt-menu-item">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="lt-check" aria-hidden="true">
        <Icon name="check" size={12} strokeWidth={3} />
      </span>
      {label}
    </label>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="lt-dialog rounded-b-none"
        style={{ borderBottom: 0, padding: '20px 16px 28px' }}
      >
        <SheetTitle className="title">Filter ideas</SheetTitle>
        {boards.length > 1 && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="lt-label">Boards</legend>
            {boards.map((b) =>
              row(
                board.length === 0 || board.includes(b.id),
                () => onChange({ board: toggle(board.length ? board : boards.map((x) => x.id), b.id) }),
                b.name,
                b.id,
              ),
            )}
          </fieldset>
        )}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lt-label">Statuses</legend>
          {STATUS_ORDER.map((s) =>
            row(
              status.includes(s),
              () => onChange({ status: toggle(status, s) }),
              <>
                <StatusIcon status={s} />
                {STATUS[s].label}
              </>,
              s,
            ),
          )}
        </fieldset>
        <Button variant="primary" onClick={() => onOpenChange(false)} style={{ width: '100%' }}>
          Show ideas
        </Button>
      </SheetContent>
    </Sheet>
  );
}
