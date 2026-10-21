import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RoadmapItem } from "@/components/board/roadmap/roadmap-item"
import type { RequestItem } from "@/lib/api"

const item = (over: Partial<RequestItem> = {}): RequestItem =>
  ({
    id: "r1",
    title: "Dark mode for the editor",
    status: "planned",
    board: { id: "b1", name: "Features" },
    votes: 48,
    voted: true,
    statusChangedAt: "2026-10-09T08:00:00Z",
    ...over,
  }) as RequestItem

describe("RoadmapItem", () => {
  it("shows the read-only sticker with the visitor's vote, the board and when it happened", () => {
    render(<RoadmapItem item={item()} column="completed" now={new Date("2026-10-16T12:00:00Z")} />)
    expect(screen.queryByRole("button")).toBeNull()
    const sticker = screen.getByLabelText("48 votes, including yours")
    expect(sticker).toHaveTextContent("48")
    expect(sticker).toHaveClass("-rotate-7")
    expect(screen.getByText("Features")).toBeInTheDocument()
    expect(screen.getByText("Shipped 09 Oct")).toBeInTheDocument()
  })

  it("links the title to the request page", () => {
    render(<RoadmapItem item={item({ voted: false })} column="planned" now={new Date("2026-10-16T12:00:00Z")} />)
    expect(screen.getByRole("link", { name: "Dark mode for the editor" })).toHaveAttribute("href", "/feedback/r1")
    expect(screen.getByLabelText("48 votes")).not.toHaveClass("-rotate-7")
  })
})
