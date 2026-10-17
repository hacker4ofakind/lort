"use client"

import { STATUS_OPTIONS } from "@/components/lort/floating-bar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Toggle } from "@/components/ui/toggle"
import type { Ref } from "@/lib/config"
import type { Status } from "@/lib/status"

export interface FiltersSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  boards: Ref[]
  selectedBoards: string[]
  onSelectedBoardsChange: (ids: string[]) => void
  selectedStatuses: Status[]
  onSelectedStatusesChange: (s: Status[]) => void
}

function toggle<T extends string>(list: T[], v: T, on: boolean): T[] {
  return on ? [...list, v] : list.filter((x) => x !== v)
}

/** Phones: the board's Board and Status filters in a bottom sheet, as toggle pills. */
export function FiltersSheet(p: FiltersSheetProps) {
  return (
    <Sheet open={p.open} onOpenChange={p.onOpenChange}>
      <SheetContent side="bottom" className="gap-5 px-5 pt-5">
        <SheetHeader className="p-0">
          <SheetTitle className="font-display text-title">Filters</SheetTitle>
        </SheetHeader>
        {p.boards.length > 1 && (
          <section aria-label="Boards" className="flex flex-wrap gap-2">
            {p.boards.map((b) => (
              <Toggle
                key={b.id}
                pressed={p.selectedBoards.includes(b.id)}
                onPressedChange={(on) => p.onSelectedBoardsChange(toggle(p.selectedBoards, b.id, on))}
              >
                {b.name}
              </Toggle>
            ))}
          </section>
        )}
        <section aria-label="Statuses" className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((o) => (
            <Toggle
              key={o.value}
              pressed={p.selectedStatuses.includes(o.value)}
              onPressedChange={(on) => p.onSelectedStatusesChange(toggle(p.selectedStatuses, o.value, on))}
            >
              {o.icon}
              {o.label}
            </Toggle>
          ))}
        </section>
        <div className="flex gap-2 pb-2">
          <Button
            variant="ghost"
            onClick={() => {
              p.onSelectedBoardsChange([])
              p.onSelectedStatusesChange([])
            }}
          >
            Clear
          </Button>
          <span className="flex-1" />
          <Button onClick={() => p.onOpenChange(false)}>Show ideas</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
