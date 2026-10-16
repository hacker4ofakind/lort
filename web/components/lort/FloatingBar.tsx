'use client';

import * as React from 'react';
import { Button } from './Button';
import { FilterMenu } from './FilterMenu';
import { SortTabs } from './SortTabs';
import { StatusIcon } from './StatusIcon';
import { cx, STATUS, STATUS_ORDER } from './utils';

export interface FloatingBarProps {
  /** Public boards as filter options (value = board id). The Board filter is omitted when there is only one. */
  boards: { value: string; label: string }[];
  sort?: string;
  onSortChange?: (sort: string) => void;
  selectedBoards?: string[];
  onSelectedBoardsChange?: (boards: string[]) => void;
  selectedStatuses?: string[];
  onSelectedStatusesChange?: (statuses: string[]) => void;
  onSuggest?: () => void;
  /** Phone layout: sort tabs, one filter button, a round "+". */
  compact?: boolean;
  onOpenFilters?: () => void;
  className?: string;
}

/** Statuses still in play: the board's default status filter. */
const OPEN = ['pending', 'reviewing', 'planned', 'progress'];

/** The pill bar at the bottom of /feedback: sort, filters and the one primary action. */
export function FloatingBar({
  boards,
  sort,
  onSortChange,
  selectedBoards,
  onSelectedBoardsChange,
  selectedStatuses,
  onSelectedStatusesChange,
  onSuggest,
  compact = false,
  onOpenFilters,
  className,
}: FloatingBarProps) {
  const statusOptions = STATUS_ORDER.map((s) => ({
    value: s,
    label: STATUS[s].label,
    icon: <StatusIcon status={s} />,
  }));
  if (compact) {
    return (
      <div className={cx('lt-bar', 'lt-bar-compact', className)}>
        <SortTabs value={sort} onValueChange={onSortChange} />
        <Button variant="secondary" icon="filter" iconOnly aria-label="Filter" onClick={onOpenFilters} />
        <Button variant="primary" icon="plus" iconOnly aria-label="Suggest something" onClick={onSuggest} />
      </div>
    );
  }
  return (
    <div className={cx('lt-bar', className)}>
      <SortTabs value={sort} onValueChange={onSortChange} />
      {boards.length > 1 && (
        <FilterMenu
          allLabel="All boards"
          noun="boards"
          options={boards}
          selected={selectedBoards}
          onSelectedChange={onSelectedBoardsChange}
        />
      )}
      <FilterMenu
        allLabel="Every status"
        noun="statuses"
        options={statusOptions}
        selected={selectedStatuses}
        defaultSelected={OPEN}
        onSelectedChange={onSelectedStatusesChange}
        summarize={(v) => (v.length === OPEN.length && OPEN.every((s) => v.includes(s)) ? 'Open ideas' : undefined)}
      />
      <Button variant="primary" icon="plus" onClick={onSuggest}>
        Suggest something
      </Button>
    </div>
  );
}
