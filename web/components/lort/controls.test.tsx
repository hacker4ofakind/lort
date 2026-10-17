import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { addImages, Composer, MAX_IMAGE_BYTES } from "@/components/lort/composer"
import { filterSummary } from "@/components/lort/filter-menu"
import { FloatingBar } from "@/components/lort/floating-bar"
import { TriageBar } from "@/components/lort/triage-bar"
import { OPEN_STATUSES } from "@/lib/status"

const file = (name: string, size: number, type = "image/png") => {
  const f = new File(["x"], name, { type })
  Object.defineProperty(f, "size", { value: size })
  return f
}

describe("filterSummary", () => {
  const opts = [...OPEN_STATUSES, "completed", "closed"].map((v) => ({ value: v, label: v }))
  const p = { allLabel: "Every status", noun: "statuses", options: opts }
  it("summarises the selection", () => {
    expect(filterSummary(p, [])).toBe("Every status")
    expect(filterSummary(p, ["closed"])).toBe("closed")
    expect(filterSummary(p, ["closed", "completed"])).toBe("2 statuses")
    expect(filterSummary({ ...p, summarize: (v) => (v.length === 4 ? "Open ideas" : undefined) }, OPEN_STATUSES)).toBe(
      "Open ideas"
    )
  })
})

describe("FloatingBar", () => {
  const props = {
    sort: "trending" as const,
    onSortChange: vi.fn(),
    selectedBoards: [],
    onSelectedBoardsChange: vi.fn(),
    selectedStatuses: OPEN_STATUSES,
    onSelectedStatusesChange: vi.fn(),
    onSuggest: vi.fn(),
    onOpenFilters: vi.fn(),
  }
  it("hides the board filter with one board", () => {
    const { rerender } = render(<FloatingBar {...props} boards={[{ id: "b1", name: "Features" }]} />)
    expect(screen.queryByText("All boards")).toBeNull()
    expect(screen.getByText("Open ideas")).toBeInTheDocument()
    rerender(
      <FloatingBar
        {...props}
        boards={[
          { id: "b1", name: "Features" },
          { id: "b2", name: "Bugs" },
        ]}
      />
    )
    expect(screen.getByText("All boards")).toBeInTheDocument()
  })
})

describe("Composer", () => {
  it("limits images to three under 5 MB each", () => {
    const three = [file("a.png", 10), file("b.png", 10), file("c.png", 10)]
    expect(addImages([], [...three, file("d.png", 10)])).toEqual({
      images: three,
      error: "You can attach up to 3 images.",
    })
    expect(addImages([], [file("big.png", MAX_IMAGE_BYTES + 1)]).error).toBe("big.png is over 5 MB. Try a smaller screenshot.")
    expect(addImages([], [file("notes.pdf", 10, "application/pdf")]).error).toBe("Only images can be attached.")
  })

  it("locks while sending, clears on success and keeps the draft on failure", async () => {
    let finish!: () => void
    let fail!: (e: Error) => void
    const onSubmit = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_, reject) => (fail = reject)))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
    render(<Composer onSubmit={onSubmit} />)
    const field = screen.getByRole("textbox", { name: "Comment" })
    await userEvent.type(field, "Same on iOS")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(field).toHaveAttribute("readonly")
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()

    fail(new Error("Your account can't post on this board."))
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account can't post on this board.")
    expect(field).toHaveValue("Same on iOS")

    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    finish()
    await vi.waitFor(() => expect(field).toHaveValue(""))
    expect(onSubmit).toHaveBeenLastCalledWith({ text: "Same on iOS", images: [], visibility: "public" })
  })

  it("offers internal notes only to admins", async () => {
    const { rerender } = render(<Composer onSubmit={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Visibility/ })).toBeNull()
    rerender(<Composer onSubmit={vi.fn()} canUseInternal />)
    await userEvent.click(screen.getByRole("button", { name: /Visibility: Public/ }))
    expect(screen.getByRole("textbox", { name: "Internal note" })).toBeInTheDocument()
  })
})

describe("TriageBar", () => {
  it("shows the status's actions with the forward one last", () => {
    render(<TriageBar status="reviewing" onAction={vi.fn()} />)
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Close", "Merge", "Skip", "Add to roadmap"])
  })
})
