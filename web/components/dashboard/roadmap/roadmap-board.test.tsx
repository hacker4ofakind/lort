import type { ReactNode } from "react"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ClientResponseError } from "pocketbase"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoadmapBoard } from "@/components/dashboard/roadmap/roadmap-board"
import type { RequestItem, Roadmap, StatusChange } from "@/lib/api"
import { DEFAULT_CONFIG } from "@/lib/config"
import { COLLAPSED_KEY } from "@/lib/roadmap"

const droppables = vi.hoisted(() => ({ ids: [] as string[] }))
const toast = vi.hoisted(() => Object.assign(vi.fn(), { dismiss: vi.fn(), custom: vi.fn() }))

vi.mock("sonner", () => ({ toast }))
vi.mock("@/components/lort/undo-toast", () => ({ undoToast: vi.fn() }))
vi.mock("@/app/providers", () => ({ useConfig: () => ({ ...DEFAULT_CONFIG, appName: "Driftnote", roadmapPublic: true }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard/roadmap" }))
vi.mock("@/lib/realtime", () => ({ useLiveRefresh: () => ({ live: false }) }))
vi.mock("@/components/dashboard/use-boards", () => ({ useBoards: () => ({ data: [] }) }))
vi.mock("@/components/board/suggest-dialog", () => ({ SuggestDialog: () => null }))
vi.mock("@dnd-kit/core", async (orig) => {
  const real = await orig<typeof import("@dnd-kit/core")>()
  return {
    ...real,
    useDroppable: (args: Parameters<typeof real.useDroppable>[0]) => {
      droppables.ids.push(String(args.id))
      return real.useDroppable(args)
    },
  }
})

const roadmap = vi.fn<() => Promise<Roadmap>>()
const move = vi.fn<(id: string, from: string, to: string) => Promise<StatusChange>>()
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  roadmap: () => roadmap(),
  moveOnRoadmap: (_c: unknown, id: string, from: string, to: string) => move(id, from, to),
  undoComplete: vi.fn(),
}))

const item = (id: string, title: string, votes: number) =>
  ({
    id,
    title,
    votes,
    voted: false,
    body: "",
    visible: true,
    board: { id: "b", name: "Features" },
    tags: [],
    author: { id: "u", name: "Mara", avatar: "", team: false },
    created: "2026-09-01T00:00:00Z",
    statusChangedAt: "2026-10-01T00:00:00Z",
  }) as unknown as RequestItem

const data = (): Roadmap => ({
  planned: [item("a", "Dark mode", 9), item("b", "Calendar view", 4)],
  progress: [item("c", "Offline sync", 2)],
  completed: [item("d", "Tags", 5)],
  shipped: 1,
})

let qc: QueryClient
function renderBoard() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return render(<RoadmapBoard />, { wrapper })
}

const column = (name: string) => screen.getByRole("region", { name })
const titlesIn = (name: string) => within(column(name)).queryAllByRole("heading", { level: 3 }).map((h) => h.textContent)

async function moveVia(title: string, to: string) {
  await userEvent.click(screen.getByRole("button", { name: `Move ${title}` }))
  await userEvent.click(await screen.findByRole("menuitem", { name: `Move to ${to}` }))
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

beforeEach(() => {
  droppables.ids = []
  toast.mockClear()
  toast.dismiss.mockClear()
  roadmap.mockReset()
  roadmap.mockImplementation(async () => data())
  move.mockReset()
})

describe("RoadmapBoard", () => {
  it("shows the three columns with their cards and counts", async () => {
    renderBoard()
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument()
    await screen.findByText("Dark mode")
    expect(titlesIn("Planned")).toEqual(["Dark mode", "Calendar view"])
    expect(titlesIn("In progress")).toEqual(["Offline sync"])
    expect(titlesIn("Completed")).toEqual(["Tags"])
    expect(within(column("Planned")).getByText("2")).toBeInTheDocument()
  })

  it("describes every card by what Space and Enter do", async () => {
    renderBoard()
    const card = await screen.findByRole("button", { name: "Dark mode" })
    expect(card).toHaveAttribute("aria-roledescription", "draggable card")
    const described = card.getAttribute("aria-describedby")!.split(" ")
    expect(described.map((id) => document.getElementById(id)?.textContent)).toContain("Press Space to move it, Enter to open it.")
  })

  it("puts only the failed card back, and keeps another card's pending move", async () => {
    const a = deferred<StatusChange>()
    const b = deferred<StatusChange>()
    move.mockImplementation((id) => (id === "a" ? a.promise : b.promise))
    renderBoard()
    await screen.findByText("Dark mode")

    await moveVia("Dark mode", "In progress")
    await moveVia("Calendar view", "Completed")
    expect(titlesIn("In progress")).toContain("Dark mode")
    expect(titlesIn("Completed")).toContain("Calendar view")

    await act(async () => a.reject(new ClientResponseError({ status: 409, response: { message: "Someone moved that card meanwhile." } })))
    await waitFor(() => expect(titlesIn("Planned")).toEqual(["Dark mode"]))
    expect(toast).toHaveBeenCalledWith("Couldn't move “Dark mode”. Someone moved that card meanwhile.")
    expect(titlesIn("Completed")).toContain("Calendar view")
    expect(move).toHaveBeenCalledWith("a", "planned", "progress")
    expect(move).toHaveBeenCalledWith("b", "planned", "completed")
  })

  it("doesn't snap a pending card back when the roadmap is refetched", async () => {
    const a = deferred<StatusChange>()
    move.mockReturnValue(a.promise)
    renderBoard()
    await screen.findByText("Dark mode")
    await moveVia("Dark mode", "In progress")
    expect(titlesIn("In progress")).toContain("Dark mode")

    const calls = roadmap.mock.calls.length
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["requests"] })
    })
    expect(roadmap.mock.calls.length).toBeGreaterThan(calls) // the server still said Planned
    expect(titlesIn("In progress")).toContain("Dark mode")
    expect(titlesIn("Planned")).not.toContain("Dark mode")
  })

  it("doesn't let an older refetch clear a newer move", async () => {
    const a = deferred<StatusChange>()
    const b = deferred<StatusChange>()
    move.mockImplementation((id) => (id === "a" ? a.promise : b.promise))
    // The server's roadmap right after the first move only: Calendar view is still Planned.
    const afterA = data()
    afterA.progress = [{ ...afterA.planned[0], status: "progress" } as RequestItem, ...afterA.progress]
    afterA.planned = afterA.planned.slice(1)
    const afterBoth = { ...afterA, planned: [], completed: [afterA.planned[0], ...afterA.completed] }
    const first = deferred<Roadmap>()
    roadmap.mockImplementationOnce(async () => data()) // the first load
    roadmap.mockImplementationOnce(() => first.promise) // the refetch after move A, still on its way
    roadmap.mockImplementation(async () => afterBoth) // every refetch after that
    renderBoard()
    await screen.findByText("Dark mode")

    await moveVia("Dark mode", "In progress")
    await act(async () => a.resolve({ from: "planned", to: "progress", roadmap: "" }))
    await waitFor(() => expect(roadmap).toHaveBeenCalledTimes(2))

    await moveVia("Calendar view", "Completed")
    await act(async () => b.resolve({ from: "planned", to: "completed", roadmap: "" }))
    // The old answer, from before move B, lands now.
    await act(async () => first.resolve(afterA))
    expect(titlesIn("Completed")).toContain("Calendar view")
    expect(titlesIn("In progress")).toContain("Dark mode")

    // A second refetch follows, and agrees.
    await waitFor(() => expect(roadmap).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(titlesIn("Completed")).toContain("Calendar view"))
    expect(titlesIn("Planned")).not.toContain("Calendar view")
  })

  it("can't lift a card whose move is on its way", async () => {
    move.mockReturnValue(new Promise(() => {}))
    renderBoard()
    await screen.findByText("Dark mode")
    await moveVia("Dark mode", "In progress")
    const card = screen.getByRole("button", { name: "Dark mode" })
    expect(card).toHaveAttribute("aria-disabled", "true")
    expect(card).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: "Move Dark mode" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Calendar view" })).toHaveAttribute("aria-disabled", "false")
  })

  it("moves into Completed with an Undo toast named after the card", async () => {
    move.mockResolvedValue({ from: "planned", to: "completed", roadmap: "" })
    const { undoToast } = await import("@/components/lort/undo-toast")
    renderBoard()
    await screen.findByText("Dark mode")
    await moveVia("Dark mode", "Completed")
    await waitFor(() => expect(undoToast).toHaveBeenCalledWith(expect.objectContaining({ message: "Marked “Dark mode” as completed", id: expect.stringMatching(/^a-/) })))
  })

  it("says the roadmap didn't load and tries again", async () => {
    roadmap.mockRejectedValueOnce(new ClientResponseError({ status: 500, response: {} }))
    renderBoard()
    expect(await screen.findByText("The roadmap didn't load.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Dark mode")).toBeInTheDocument()
  })

  it("collapses a column to a labelled strip that is still a drop target", async () => {
    localStorage.setItem(COLLAPSED_KEY, '["completed"]')
    renderBoard()
    const strip = await screen.findByRole("button", { name: "Completed, 1 in the last 30 days. Expand" })
    expect(screen.queryByRole("region", { name: "Completed" })).toBeNull()
    expect(droppables.ids).toContain("completed")

    await userEvent.click(strip)
    expect(await screen.findByRole("region", { name: "Completed" })).toBeInTheDocument()
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe("[]")
  })

  it("collapses with a button on the column", async () => {
    renderBoard()
    await screen.findByText("Dark mode")
    await userEvent.click(screen.getByRole("button", { name: "Collapse Planned" }))
    expect(screen.getByRole("button", { name: "Planned, 2 requests. Expand" })).toBeInTheDocument()
  })

  it("offers + on Planned and In progress only", async () => {
    renderBoard()
    await screen.findByText("Dark mode")
    expect(screen.getByRole("button", { name: "Add a planned request" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add an in-progress request" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Add a.* completed/ })).toBeNull()
  })
})
