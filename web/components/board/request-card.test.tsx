import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RequestCard } from "@/components/board/request-card"
import type { RequestItem } from "@/lib/api"

const item = (over: Partial<RequestItem> = {}): RequestItem => ({
  id: "r1",
  title: "Lock the app with Face ID",
  body: "Some entries are personal.",
  status: "pending",
  board: { id: "b1", name: "Features" },
  author: { id: "u1", name: "Luk", avatar: "", team: false },
  tags: [],
  comments: 2,
  votes: 1,
  voted: true,
  visible: false,
  awaitingApproval: true,
  new: false,
  created: "2026-10-14T10:00:00Z",
  ...over,
})

describe("RequestCard", () => {
  it("links to the request and shows its meta row", () => {
    render(<RequestCard request={item()} onVote={vi.fn()} />)
    expect(screen.getByRole("link", { name: "Lock the app with Face ID" })).toHaveAttribute("href", "/feedback/r1")
    expect(screen.getByText("Pending")).toBeInTheDocument()
    expect(screen.getByLabelText("2 comments")).toBeInTheDocument()
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument()
  })

  it("can't take votes once closed", () => {
    render(<RequestCard request={item({ status: "closed", awaitingApproval: false })} onVote={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /upvote/i })).toBeNull()
    expect(screen.getByLabelText("1 vote")).toBeInTheDocument()
  })
})
