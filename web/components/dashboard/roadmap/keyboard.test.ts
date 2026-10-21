import type { CollisionDetection, DroppableContainer } from "@dnd-kit/core"
import { describe, expect, it } from "vitest"
import { announcements, KEYBOARD_CODES, makeCollisionDetection, makeCoordinateGetter, SCREEN_READER_INSTRUCTIONS } from "@/components/dashboard/roadmap/keyboard"
import type { RoadmapStatus } from "@/lib/api"

const rects = new Map(
  (["planned", "progress", "completed"] as const).map((id, i) => [id, { left: 100 + i * 300, top: 120, width: 280, height: 700, right: 380 + i * 300, bottom: 820 }])
)

function ctx(overId: string | null, column: RoadmapStatus = "planned") {
  return {
    active: "r1",
    currentCoordinates: { x: 0, y: 0 },
    context: { droppableRects: rects, over: overId ? { id: overId } : null, active: { data: { current: { column } } } },
  } as never
}

const press = (code: string) => new KeyboardEvent("keydown", { code, cancelable: true })

describe("coordinate getter", () => {
  it("jumps to the next column's corner and remembers it", () => {
    const target = { current: null as RoadmapStatus | null }
    const get = makeCoordinateGetter(target)
    const e = press("ArrowRight")
    expect(get(e, ctx("planned"))).toEqual({ x: 400 + 16, y: 120 + 16 })
    expect(target.current).toBe("progress")
    expect(e.defaultPrevented).toBe(true)
    expect(get(press("ArrowDown"), ctx("progress"))).toEqual({ x: 700 + 16, y: 136 })
    expect(target.current).toBe("completed")
  })

  it("stays on the first column at the left edge, and on the last at the right edge", () => {
    const target = { current: null as RoadmapStatus | null }
    const get = makeCoordinateGetter(target)
    expect(get(press("ArrowLeft"), ctx("planned"))).toEqual({ x: 116, y: 136 })
    expect(target.current).toBe("planned")
    expect(get(press("ArrowRight"), ctx("completed", "completed"))).toEqual({ x: 716, y: 136 })
  })

  it("starts from the card's own column before anything is over", () => {
    const get = makeCoordinateGetter({ current: null })
    expect(get(press("ArrowRight"), ctx(null, "progress"))).toEqual({ x: 716, y: 136 })
  })

  it("ignores other keys", () => {
    const target = { current: null as RoadmapStatus | null }
    const e = press("KeyA")
    expect(makeCoordinateGetter(target)(e, ctx("planned"))).toBeUndefined()
    expect(e.defaultPrevented).toBe(false)
    expect(target.current).toBeNull()
  })

  it("starts and drops with Space, cancels with Escape, and leaves Enter to the card", () => {
    expect(KEYBOARD_CODES).toEqual({ start: ["Space"], cancel: ["Escape"], end: ["Space"] })
  })
})

describe("collision detection", () => {
  const container = (id: string) => ({ id, rect: { current: rects.get(id as RoadmapStatus) } }) as unknown as DroppableContainer
  const args = (pointer: { x: number; y: number } | null) =>
    ({
      active: { id: "r1" },
      collisionRect: { left: 120, top: 140, width: 260, height: 80, right: 380, bottom: 220 },
      droppableRects: rects,
      droppableContainers: ["planned", "progress", "completed"].map(container),
      pointerCoordinates: pointer,
    }) as unknown as Parameters<CollisionDetection>[0]

  it("returns the column the keyboard chose, even a narrow collapsed one the rectangles would not pick", () => {
    const target = { current: "completed" as RoadmapStatus | null }
    const found = makeCollisionDetection(target)(args(null))
    expect(found.map((c) => c.id)).toEqual(["completed"])
  })

  it("follows the pointer for the mouse", () => {
    const found = makeCollisionDetection({ current: null })(args({ x: 450, y: 300 }))
    expect(found[0].id).toBe("progress")
  })

  it("falls back to the card's own column before the keyboard has chosen one", () => {
    const found = makeCollisionDetection({ current: null })(args(null))
    expect(found[0].id).toBe("planned")
  })
})

describe("announcements", () => {
  const active = { id: "r1", data: { current: { title: "Dark mode", column: "planned" } } }
  const over = (id: string) => ({ id }) as never

  it("says what is picked up, where it is, and what happened", () => {
    const a = announcements()
    expect(SCREEN_READER_INSTRUCTIONS.draggable).toBe(
      "To move a card, press Space. Use the arrow keys to pick a column, Space to drop it there, or Escape to cancel."
    )
    expect(a.onDragStart({ active: active as never })).toBe("Picked up Dark mode. It's in Planned.")
    expect(a.onDragOver({ active: active as never, over: over("planned") })).toBeUndefined() // still where it was
    expect(a.onDragOver({ active: active as never, over: over("progress") })).toBe("Dark mode is over In progress.")
    expect(a.onDragOver({ active: active as never, over: over("planned") })).toBe("Dark mode is over Planned.") // back again
    expect(a.onDragEnd({ active: active as never, over: over("progress") })).toBe("Moved Dark mode to In progress.")
    expect(a.onDragEnd({ active: active as never, over: over("planned") })).toBe("Dark mode stays in Planned.")
    expect(a.onDragCancel({ active: active as never, over: null })).toBe("Cancelled. Dark mode stays in Planned.")
  })

  it("is quiet when the card is over nothing", () => {
    const a = announcements()
    expect(a.onDragOver({ active: active as never, over: null })).toBeUndefined()
    expect(a.onDragEnd({ active: active as never, over: null })).toBe("Dark mode stays in Planned.")
  })
})
