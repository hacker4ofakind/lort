import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RequestsTable } from "@/components/dashboard/requests-table"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { RequestItem } from "@/lib/api"

const row: RequestItem = {
  id: "r1",
  title: "Crash when pasting a long screenshot",
  body: "",
  status: "pending",
  board: { id: "b1", name: "Bugs" },
  author: { id: "u1", name: "Tomás", avatar: "", team: false },
  tags: [
    { id: "t1", name: "editor" },
    { id: "t2", name: "ios" },
    { id: "t3", name: "ui" },
  ],
  comments: 0,
  votes: 3,
  voted: false,
  visible: false,
  awaitingApproval: true,
  new: true,
  created: "2026-10-14T10:00:00Z",
}

describe("RequestsTable", () => {
  it("shows the icon-only status with a name, the markers and the queue in the link", () => {
    render(
      <TooltipProvider>
        <RequestsTable items={[row]} search="?status=pending" fresh={[]} />
      </TooltipProvider>
    )
    expect(screen.getByRole("img", { name: "Pending" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: row.title })).toHaveAttribute("href", "/dashboard/requests/r1?status=pending")
    expect(screen.getByText("New")).toBeInTheDocument()
    expect(screen.getByText("Hidden")).toBeInTheDocument()
    expect(screen.getByText("+1")).toBeInTheDocument()
  })
})
