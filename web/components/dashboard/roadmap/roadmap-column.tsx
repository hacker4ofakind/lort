"use client"

import { useEffect, useRef } from "react"
import { useDndContext, useDroppable } from "@dnd-kit/core"
import { IconArrowsMinimize, IconPlus } from "@tabler/icons-react"
import type { CardData } from "@/components/dashboard/roadmap/keyboard"
import { RoadmapCard } from "@/components/dashboard/roadmap/roadmap-card"
import { StatusIcon, StatusLabel } from "@/components/lort/status-icon"
import { Button } from "@/components/ui/button"
import type { RequestItem, RoadmapStatus } from "@/lib/api"
import type { RoadmapColumn as ColumnInfo } from "@/lib/roadmap"
import { cn } from "@/lib/utils"

const ADD_LABEL: Partial<Record<RoadmapStatus, string>> = {
  planned: "Add a planned request",
  progress: "Add an in-progress request",
}

/** "4 requests", "1 request", or for Completed "6 in the last 30 days". */
export function countText(status: RoadmapStatus, n: number): string {
  if (status === "completed") return `${n} in the last 30 days`
  return `${n} ${n === 1 ? "request" : "requests"}`
}

export interface RoadmapColumnProps {
  col: ColumnInfo
  items: RequestItem[]
  collapsed: boolean
  busy: Set<string>
  fresh: { id: string; focus: boolean } | null
  hintId: string
  onToggle: () => void
  onAdd?: () => void
  onOpen: (id: string) => void
  onMove: (id: string, to: RoadmapStatus) => void
}

/**
 * One status column, and a drop target whether it is open or collapsed to a strip. A card over
 * it (from another column) lights it up with a ring and says what dropping does.
 */
export function RoadmapColumn({ col, items, collapsed, busy, fresh, hintId, onToggle, onAdd, onOpen, onMove }: RoadmapColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status })
  const { active } = useDndContext()
  const target = isOver && (active?.data.current as CardData | undefined)?.column !== col.status
  const ring = target && "bg-surface-2 ring-2 ring-primary-text ring-inset"

  // A card dropped with the keyboard into a collapsed column has no card to focus there (the
  // strip shows none), and the one it left is gone: focus the strip, which says what is inside.
  const strip = useRef<HTMLButtonElement | null>(null)
  const focusStrip = collapsed && !!fresh?.focus && items.some((i) => i.id === fresh.id)
  // `fresh` is a new object for every drop, so a second drop into the same collapsed column (while
  // the first is still highlighted) focuses the strip again.
  useEffect(() => {
    if (focusStrip) strip.current?.focus()
  }, [focusStrip, fresh])

  if (collapsed) {
    return (
      <button
        ref={(node) => {
          setNodeRef(node)
          strip.current = node
        }}
        type="button"
        onClick={onToggle}
        aria-label={`${col.label}, ${countText(col.status, items.length)}. Expand`}
        className={cn(
          "flex items-center gap-3 rounded-xl bg-ground-sunken px-4 py-3 transition-colors hover:bg-surface-2 md:min-h-[560px] md:flex-col md:px-0 md:py-4",
          ring
        )}
      >
        <StatusIcon status={col.status} size={20} keyline decorative />
        <span className="rounded-full bg-surface-2 px-2.5 py-px text-[13px] font-bold text-muted-foreground">{items.length}</span>
        <span className="font-display text-title md:[writing-mode:vertical-rl]">{col.label}</span>
      </button>
    )
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={col.label}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl bg-ground-sunken p-3.5 transition-colors [--si-ground:var(--ground-sunken)] md:min-h-[560px]",
        ring
      )}
    >
      <div className="flex items-center gap-2 px-0.5 pt-0.5 pb-1.5">
        <StatusLabel status={col.status} size={20} keyline className="font-display text-title" />
        <span className={cn("rounded-full bg-surface-2 px-2.5 py-px text-[13px] font-bold text-muted-foreground", target && "bg-surface-3")}>
          {items.length}
        </span>
        <span className="flex-1" />
        {onAdd && (
          <Button variant="ghost" size="icon-sm" aria-label={ADD_LABEL[col.status]} onClick={onAdd}>
            <IconPlus />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={`Collapse ${col.label}`} onClick={onToggle} className="max-md:hidden">
          <IconArrowsMinimize />
        </Button>
      </div>
      {items.map((item) => (
        <RoadmapCard
          key={item.id}
          item={item}
          column={col.status}
          busy={busy.has(item.id)}
          fresh={fresh?.id === item.id ? fresh : null}
          hintId={hintId}
          onOpen={() => onOpen(item.id)}
          onMove={(to) => onMove(item.id, to)}
        />
      ))}
      {items.length === 0 && !target && <p className="px-0.5 py-2 text-label font-normal text-muted-foreground">Nothing here yet.</p>}
      {target && <p className="mt-1 p-2 text-center text-[13px] font-semibold text-foreground">{col.dropHint}</p>}
    </section>
  )
}
