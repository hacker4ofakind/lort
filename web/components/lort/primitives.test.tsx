import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { InternalNote } from "@/components/lort/internal-note"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { fillPath, StatusIcon, StatusLabel, StatusText } from "@/components/lort/status-icon"
import { VoteSticker } from "@/components/lort/vote-sticker"
import { statusMoves, triageActions } from "@/lib/status"

describe("statuses", () => {
  it("offers the spec's triage actions", () => {
    expect(triageActions("pending").map((a) => a.id)).toEqual(["close", "merge", "skip", "accept"])
    expect(triageActions("closed").map((a) => [a.id, a.next])).toEqual([["reopen", "pending"]])
    expect(statusMoves("reviewing").map((a) => a.next)).toEqual(["closed", "planned"])
  })

  it("fills the circle from the bottom", () => {
    expect(fillPath(0, 5)).toBe("")
    expect(fillPath(0.5, 5)).toBe("M3 8A5 5 0 0 0 13 8Z")
  })
})

describe("StatusIcon", () => {
  it("is an image named after the status, or decorative next to its label", () => {
    render(<StatusIcon status="progress" />)
    expect(screen.getByRole("img", { name: "In progress" })).toBeInTheDocument()
    render(<StatusLabel status="planned" />)
    expect(screen.getByText("Planned")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Planned" })).toBeNull()
    render(<StatusText status="closed" />)
    expect(screen.getByText("Closed")).toHaveClass("text-status-closed-text")
  })
})

describe("VoteSticker", () => {
  it("names the action and reports toggles", async () => {
    const onToggle = vi.fn()
    const { rerender } = render(<VoteSticker count={21} voted={false} subject="Dark mode" onToggle={onToggle} />)
    await userEvent.click(screen.getByRole("button", { name: "Upvote Dark mode, 21 votes" }))
    expect(onToggle).toHaveBeenCalledOnce()
    rerender(<VoteSticker count={22} voted subject="Dark mode" onToggle={onToggle} />)
    expect(screen.getByRole("button", { name: "Remove your upvote from Dark mode, 22 votes" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  it("is not a control when read-only", () => {
    render(<VoteSticker count={5} voted={false} readOnly />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByLabelText("5 votes")).toBeInTheDocument()
  })
})

describe("PersonAvatar and InternalNote", () => {
  it("names team members and falls back to an initial", () => {
    render(<PersonAvatar person={{ id: "u1", name: "Luk", team: true }} />)
    expect(screen.getByRole("img", { name: "Luk (team)" })).toHaveTextContent("L")
  })

  it("says only the team sees a note", () => {
    render(<InternalNote author="Luk" time="1 hour ago">Reproduced it</InternalNote>)
    expect(screen.getByText("Only the team sees this")).toBeInTheDocument()
  })
})
