import { render, screen } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { describe, expect, it, vi } from "vitest"
import { RoadmapColumn } from "@/components/dashboard/roadmap/roadmap-column"
import type { RequestItem } from "@/lib/api"
import { columnOf } from "@/lib/roadmap"

const item = { id: "r1", title: "Dark mode", votes: 1, voted: false, visible: true, board: { id: "b", name: "Features" }, tags: [], author: { id: "u", name: "Mara", avatar: "", team: false } } as unknown as RequestItem

function column(over: { collapsed: boolean; fresh: { id: string; focus: boolean } | null; items?: RequestItem[] }) {
  return (
    <DndContext>
      <RoadmapColumn
        col={columnOf("completed")}
        items={over.items ?? [item]}
        collapsed={over.collapsed}
        busy={new Set()}
        fresh={over.fresh}
        hintId="hint"
        onToggle={vi.fn()}
        onOpen={vi.fn()}
        onMove={vi.fn()}
      />
    </DndContext>
  )
}

describe("RoadmapColumn focus after a drop", () => {
  it("focuses the strip when a card dropped with the keyboard lands in a collapsed column", () => {
    const { rerender } = render(column({ collapsed: true, fresh: null }))
    const strip = screen.getByRole("button", { name: "Completed, 1 in the last 30 days. Expand" })
    expect(strip).not.toHaveFocus()
    rerender(column({ collapsed: true, fresh: { id: "r1", focus: true } }))
    expect(strip).toHaveFocus()
  })

  it("focuses the strip again for a second keyboard drop while the first is still highlighted", () => {
    const two = [item, { ...item, id: "r2", title: "Tags" }]
    const { rerender } = render(column({ collapsed: true, fresh: null, items: [item] }))
    const strip = screen.getByRole("button", { name: /Expand$/ })
    rerender(column({ collapsed: true, fresh: { id: "r1", focus: true }, items: [item] }))
    expect(strip).toHaveFocus()

    strip.blur() // the next card's source is gone and focus is on the page again
    expect(strip).not.toHaveFocus()
    rerender(column({ collapsed: true, fresh: { id: "r2", focus: true }, items: two }))
    expect(strip).toHaveFocus()
  })

  it("leaves focus alone for a pointer drop onto the strip", () => {
    const { rerender } = render(column({ collapsed: true, fresh: null }))
    rerender(column({ collapsed: true, fresh: { id: "r1", focus: false } }))
    expect(screen.getByRole("button", { name: /Expand$/ })).not.toHaveFocus()
  })

  it("focuses the card itself when the column is open", () => {
    const { rerender } = render(column({ collapsed: false, fresh: null }))
    rerender(column({ collapsed: false, fresh: { id: "r1", focus: true } }))
    expect(screen.getByRole("button", { name: "Dark mode" })).toHaveFocus()
  })
})
