"use client"

import { useEffect, useId, useRef } from "react"
import { useDraggable } from "@dnd-kit/core"
import { IconArrowsMove } from "@tabler/icons-react"
import type { CardData } from "@/components/dashboard/roadmap/keyboard"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { VoteSticker } from "@/components/lort/vote-sticker"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { RequestItem, RoadmapStatus } from "@/lib/api"
import { columnOf, ROADMAP_COLUMNS } from "@/lib/roadmap"
import { cn } from "@/lib/utils"

const pill = "rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] font-semibold text-ink-2"

/**
 * What a roadmap card looks like. The same face is the card in its column and the floating copy
 * under the pointer; it only scales up with a shadow when floating (the dragged card does not
 * tilt: only stickers tilt). No links inside, and the avatar isn't draggable, so a long press
 * on a phone lifts the card instead of selecting text or an image.
 *
 * The card is named by its content, which is only the title: the sticker and the pills are
 * hidden from the name and read as the card's description instead. (An aria-label would have to
 * contain all the visible text to pass WCAG 2.5.3, and axe counts aria-hidden text as visible.)
 */
export function CardFace({ item, floating }: { item: RequestItem; floating?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-3.5 pb-3 max-md:pr-11 [--si-ground:var(--surface)] select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none",
        floating && "scale-[1.02] cursor-grabbing shadow-card-float"
      )}
    >
      <span aria-hidden className="contents">
        <VoteSticker count={item.votes} voted={item.voted} size="sm" readOnly />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base leading-[21px] font-bold tracking-[-0.01em] text-balance">{item.title}</h3>
        <div aria-hidden className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={pill}>{item.board.name}</span>
          {item.tags.map((t) => (
            <span key={t.id} className={pill}>
              {t.name}
            </span>
          ))}
          {!item.visible && <span className={pill}>Hidden</span>}
          <span className="flex-1" />
          <PersonAvatar person={item.author} size={22} />
        </div>
      </div>
    </div>
  )
}

/** What a screen reader hears about a card besides its title: the same facts the pills and sticker show. */
function describe(item: RequestItem): string {
  const votes = item.votes === 1 ? "1 vote" : `${item.votes} votes`
  return [
    item.voted ? `${votes}, including yours` : votes,
    item.board.name,
    ...item.tags.map((t) => t.name),
    item.visible ? "" : "Hidden from the board",
    `by ${item.author.name || "someone"}`,
  ]
    .filter(Boolean)
    .join(", ")
}

export interface RoadmapCardProps {
  item: RequestItem
  column: RoadmapStatus
  /** Its move is on the way to the server: it can't be lifted again until it lands. */
  busy: boolean
  /** It just arrived (dropped, or created with "+"): tint, scroll to it, and focus it after a keyboard drop. */
  fresh?: { focus: boolean } | null
  /** The hidden sentence every card is described by. */
  hintId: string
  onOpen: () => void
  /** The phone menu's move. */
  onMove: (to: RoadmapStatus) => void
}

/**
 * A draggable card: one tab stop that Space lifts and Enter opens. While it is in the air its
 * slot shows a dashed placeholder (the card stays in the layout, invisible, so it keeps focus).
 */
export function RoadmapCard({ item, column, busy, fresh, hintId, onOpen, onMove }: RoadmapCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { title: item.title, column } satisfies CardData,
    disabled: busy,
  })
  const el = useRef<HTMLDivElement | null>(null)
  const metaId = useId()
  const isFresh = !!fresh
  const focus = !!fresh?.focus
  useEffect(() => {
    if (!isFresh) return
    el.current?.scrollIntoView?.({ block: "nearest" })
    if (focus) el.current?.focus()
  }, [isFresh, focus])

  return (
    <div className="relative">
      <div
        ref={(node) => {
          setNodeRef(node)
          el.current = node
        }}
        {...attributes}
        {...listeners}
        aria-roledescription="draggable card"
        aria-describedby={`${hintId} ${metaId} ${attributes["aria-describedby"] ?? ""}`.trim()}
        aria-busy={busy || undefined}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isDragging) {
            e.preventDefault()
            onOpen()
            return
          }
          listeners?.onKeyDown?.(e)
        }}
        className={cn(
          "cursor-grab rounded-lg outline-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus",
          isDragging && "opacity-0",
          busy && "opacity-60",
          fresh && "animate-fresh"
        )}
      >
        <CardFace item={item} />
      </div>
      <span id={metaId} className="sr-only">
        {describe(item)}
      </span>
      {isDragging && (
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-dot-empty" />
      )}
      {/* Phones can't drag-and-drop reliably, so each card also has a menu. Outside the draggable, so
          pressing it never starts a drag and a button never sits inside a button. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${item.title}`}
              disabled={busy}
              className="absolute top-1.5 right-1.5 md:hidden"
            />
          }
        >
          <IconArrowsMove />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {ROADMAP_COLUMNS.filter((c) => c.status !== column).map((c) => (
            <DropdownMenuItem key={c.status} onClick={() => onMove(c.status)}>
              Move to {columnOf(c.status).label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
