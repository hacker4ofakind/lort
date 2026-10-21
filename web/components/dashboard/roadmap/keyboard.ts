import {
  pointerWithin,
  rectIntersection,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
} from "@dnd-kit/core"
import type { RoadmapStatus } from "@/lib/api"
import { columnOf, isRoadmapStatus, ROADMAP_ORDER } from "@/lib/roadmap"

/** What a draggable card carries in `data`, for the getter and the announcements. */
export interface CardData {
  title: string
  column: RoadmapStatus
}

/** Space lifts and drops, Escape cancels. Enter is left to the card, where it opens the request. */
export const KEYBOARD_CODES = { start: ["Space"], cancel: ["Escape"], end: ["Space"] }

export const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable: "To move a card, press Space. Use the arrow keys to pick a column, Space to drop it there, or Escape to cancel.",
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * Arrow keys jump between columns instead of nudging the card 25px: the overlay goes to the
 * previous or next column's top-left corner. The column it chose is written to `target`, so the
 * collision detection can return it even when the rectangles would pick another (a narrow
 * collapsed strip next to a wide column).
 */
export function makeCoordinateGetter(target: { current: RoadmapStatus | null }): KeyboardCoordinateGetter {
  return (event, { context: { droppableRects, over, active } }) => {
    const step = STEP[event.code]
    if (!step) return undefined
    event.preventDefault()
    const here = String(over?.id ?? (active?.data.current as CardData | undefined)?.column ?? "")
    const from = isRoadmapStatus(here) ? ROADMAP_ORDER.indexOf(here) : 0
    const next = ROADMAP_ORDER[Math.min(ROADMAP_ORDER.length - 1, Math.max(0, from + step))]
    const rect = droppableRects.get(next)
    if (!rect) return undefined
    target.current = next
    return { x: rect.left + 16, y: rect.top + 16 }
  }
}

/**
 * The column under the pointer for the mouse and touch. A keyboard drag has no pointer, so it
 * gets the column the coordinate getter chose; before the first arrow key it gets the card's
 * own column (the largest overlap).
 */
export function makeCollisionDetection(target: { current: RoadmapStatus | null }): CollisionDetection {
  return (args) => {
    if (!args.pointerCoordinates && target.current) {
      const chosen = args.droppableContainers.find((c) => c.id === target.current)
      if (chosen) return [{ id: chosen.id, data: { droppableContainer: chosen, value: 1 } }]
    }
    const within = pointerWithin(args)
    return within.length > 0 ? within : rectIntersection(args)
  }
}

const label = (id: unknown) => (isRoadmapStatus(String(id)) ? columnOf(String(id) as RoadmapStatus).label : "")
const cardOf = (active: { data: { current?: unknown } }) => active.data.current as CardData

/**
 * What a screen reader hears while a card is picked up, moved and dropped. dnd-kit reports the
 * column the card is over as soon as it is lifted; that is where it already is, and saying so
 * would replace "Picked up …" before it is read. It only speaks when the column changes.
 */
export function announcements(): Announcements {
  let spoken: string | null = null
  return {
    onDragStart: ({ active }) => {
      spoken = cardOf(active).column
      return `Picked up ${cardOf(active).title}. It's in ${label(spoken)}.`
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === spoken) return undefined
      spoken = String(over.id)
      return `${cardOf(active).title} is over ${label(over.id)}.`
    },
    onDragEnd: ({ active, over }) => {
      spoken = null
      const card = cardOf(active)
      return over && over.id !== card.column
        ? `Moved ${card.title} to ${label(over.id)}.`
        : `${card.title} stays in ${label(card.column)}.`
    },
    onDragCancel: ({ active }) => {
      spoken = null
      return `Cancelled. ${cardOf(active).title} stays in ${label(cardOf(active).column)}.`
    },
  }
}

/** One board's keyboard navigation: the getter, the collision detection that agrees with it, and a reset for each drag. */
export function createKeyboardNavigation() {
  const target: { current: RoadmapStatus | null } = { current: null }
  return {
    coordinateGetter: makeCoordinateGetter(target),
    collisionDetection: makeCollisionDetection(target),
    announcements: announcements(),
    reset: () => {
      target.current = null
    },
  }
}
