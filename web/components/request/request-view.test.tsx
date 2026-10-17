import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RequestView } from "@/components/request/request-view"
import type { RequestDetail } from "@/lib/api"

const person = (id: string, name: string, team = false) => ({ id, name, avatar: "", team })

const detail: RequestDetail = {
  id: "r1",
  title: "Sync drops my newest entry",
  body: "After a day offline.",
  status: "reviewing",
  board: { id: "b1", name: "Bugs" },
  author: person("u1", "Priya S."),
  tags: [],
  comments: 1,
  votes: 21,
  voted: false,
  visible: true,
  awaitingApproval: false,
  new: false,
  created: "2026-10-11T10:00:00Z",
  images: [],
  public: true,
  mergedInto: { id: "r2", name: "Sync conflicts" },
  thread: [
    { id: "c1", body: "Same on iOS 18.", images: [], internal: false, author: person("u2", "devon"), created: "2026-10-14T10:00:00Z", replies: [] },
  ],
  activity: [
    { id: "a1", kind: "created", actor: person("u1", "Priya S."), from: "", to: "", ref: null, created: "2026-10-11T10:00:00Z" },
    { id: "a2", kind: "status_changed", actor: person("u3", "Luk", true), from: "pending", to: "reviewing", ref: null, created: "2026-10-15T10:00:00Z" },
  ],
}

const props = {
  onVote: vi.fn(),
  chips: null,
  composer: null,
  canReply: true,
  onReply: vi.fn(),
  canDelete: () => false,
  onDelete: vi.fn(),
}

describe("RequestView", () => {
  it("shows the public page: merge banner, read-only sticker for merged requests, comment count, team wording", () => {
    render(<RequestView request={detail} {...props} />)
    expect(screen.getByText(/Merged into/)).toHaveTextContent("Merged into Sync conflicts. Its votes went there too.")
    expect(screen.queryByRole("button", { name: /Upvote/ })).toBeNull()
    expect(screen.getByRole("heading", { name: "1 comment" })).toBeInTheDocument()
    expect(screen.getByText(/from the team moved this to/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument()
  })

  it("drops the public extras in the dashboard", () => {
    render(<RequestView request={{ ...detail, mergedInto: null }} team {...props} />)
    expect(screen.queryByText("Stick a dot")).toBeNull()
    expect(screen.queryByRole("heading", { name: "1 comment" })).toBeNull()
    expect(screen.queryByText(/from the team/)).toBeNull()
    expect(screen.getByRole("button", { name: "Upvote Sync drops my newest entry, 21 votes" })).toBeInTheDocument()
  })
})
