"use client"

import { IconFilter, IconPlus } from "@tabler/icons-react"
import { FilterMenu } from "@/components/lort/filter-menu"
import { SortTabs } from "@/components/lort/sort-tabs"
import { StatusIcon } from "@/components/lort/status-icon"
import { Button } from "@/components/ui/button"
import type { Ref } from "@/lib/config"
import type { BoardSort } from "@/lib/filters"
import { OPEN_STATUSES, STATUSES, STATUS_META, type Status } from "@/lib/status"

export const BOARD_SORTS: { value: BoardSort; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
]

/** "Open ideas" when the selection is exactly the four open statuses. */
export function openIdeas(values: string[]): string | undefined {
  return values.length === OPEN_STATUSES.length && OPEN_STATUSES.every((s) => values.includes(s)) ? "Open ideas" : undefined
}

export const STATUS_OPTIONS = STATUSES.map((s) => ({
  value: s,
  label: STATUS_META[s].label,
  icon: <StatusIcon status={s} decorative />,
}))

export interface FloatingBarProps {
  /** Public boards; the Board filter is hidden when there is only one. */
  boards: Ref[]
  sort: BoardSort
  onSortChange: (sort: BoardSort) => void
  selectedBoards: string[]
  onSelectedBoardsChange: (ids: string[]) => void
  selectedStatuses: Status[]
  onSelectedStatusesChange: (statuses: Status[]) => void
  onSuggest: () => void
  /** Phones: opens the filters bottom sheet. */
  onOpenFilters: () => void
}

/** The pill bar at the bottom of /feedback. On phones: sort tabs, one filter button, a round "+". */
export function FloatingBar(p: FloatingBarProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-2 p-2 inset-shadow-sm shadow-float">
      <SortTabs options={BOARD_SORTS} value={p.sort} onValueChange={p.onSortChange} />
      <div className="hidden items-center gap-2 sm:flex">
        {p.boards.length > 1 && (
          <FilterMenu
            side="top"
            allLabel="All boards"
            noun="boards"
            options={p.boards.map((b) => ({ value: b.id, label: b.name }))}
            selected={p.selectedBoards}
            onSelectedChange={p.onSelectedBoardsChange}
          />
        )}
        <FilterMenu
          side="top"
          allLabel="Every status"
          noun="statuses"
          options={STATUS_OPTIONS}
          selected={p.selectedStatuses}
          onSelectedChange={(v) => p.onSelectedStatusesChange(v as Status[])}
          summarize={openIdeas}
        />
        <Button onClick={p.onSuggest}>
          <IconPlus stroke={2.4} />
          Suggest something
        </Button>
      </div>
      <div className="flex items-center gap-2 sm:hidden">
        <Button variant="secondary" size="icon" aria-label="Filter" onClick={p.onOpenFilters}>
          <IconFilter />
        </Button>
        <Button size="icon-lg" aria-label="Suggest something" onClick={p.onSuggest}>
          <IconPlus stroke={2.4} />
        </Button>
      </div>
    </div>
  )
}
