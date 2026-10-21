import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClientProvider } from "@tanstack/react-query"
import { ClientResponseError } from "pocketbase"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PublicRoadmap } from "@/components/board/roadmap/public-roadmap"
import type { RequestItem, Roadmap } from "@/lib/api"
import { DEFAULT_CONFIG, type SiteConfig } from "@/lib/config"
import { makeQueryClient } from "@/lib/query"

let config: SiteConfig = { ...DEFAULT_CONFIG, appName: "Driftnote" }
const roadmap = vi.fn<() => Promise<Roadmap>>()

vi.mock("@/app/providers", () => ({ useConfig: () => config }))
vi.mock("@/lib/realtime", () => ({ useLiveRefresh: () => ({ live: false }) }))
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  roadmap: () => roadmap(),
}))

const item = (id: string, title: string, status: RequestItem["status"]) =>
  ({
    id,
    title,
    status,
    board: { id: "b", name: "Features" },
    votes: 3,
    voted: false,
    statusChangedAt: new Date().toISOString(),
  }) as RequestItem

const data = (over: Partial<Roadmap> = {}): Roadmap => ({
  planned: [item("a", "Dark mode", "planned")],
  progress: [],
  completed: [item("c", "Tags", "completed")],
  shipped: 1,
  ...over,
})

function renderPage() {
  const qc = makeQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return render(<PublicRoadmap />, { wrapper })
}

beforeEach(() => {
  config = { ...DEFAULT_CONFIG, appName: "Driftnote", roadmapPublic: true }
  roadmap.mockReset()
})

describe("PublicRoadmap", () => {
  it("shows the three columns with counts, blurbs and empty copy", async () => {
    roadmap.mockResolvedValue(data())
    renderPage()
    expect(await screen.findByRole("heading", { name: "What's coming to Driftnote?" })).toBeInTheDocument()
    expect(await screen.findByText("Dark mode")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Planned" })).toHaveTextContent("Committed and up next.")
    expect(screen.getByRole("region", { name: "In progress" })).toHaveTextContent("Nothing being built right now.")
    expect(screen.getByRole("region", { name: "Completed" })).toHaveTextContent("Tags")
  })

  it("offers the full shipped list only when more has shipped than the column shows", async () => {
    roadmap.mockResolvedValue(data({ shipped: 1 }))
    const { unmount } = renderPage()
    await screen.findByText("Tags")
    expect(screen.queryByRole("link", { name: /View all/ })).toBeNull()
    unmount()

    roadmap.mockResolvedValue(data({ shipped: 71 }))
    renderPage()
    expect(await screen.findByRole("link", { name: "View all 71 shipped" })).toHaveAttribute("href", "/roadmap/shipped")
  })

  it("renders the off message and asks for nothing when the roadmap is off", () => {
    config = { ...config, roadmapPublic: false }
    renderPage()
    expect(screen.getByText("No public roadmap yet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to the board" })).toHaveAttribute("href", "/feedback")
    expect(roadmap).not.toHaveBeenCalled()
  })

  it("renders the off message when the server says there is no roadmap", async () => {
    roadmap.mockRejectedValue(new ClientResponseError({ status: 404, response: { message: "There's no public roadmap yet." } }))
    renderPage()
    expect(await screen.findByText("No public roadmap yet")).toBeInTheDocument()
  })

  it("says the roadmap didn't load, and tries again", async () => {
    // The first try and its one automatic retry both fail.
    roadmap.mockRejectedValueOnce(new ClientResponseError({ status: 500, response: {} }))
    roadmap.mockRejectedValueOnce(new ClientResponseError({ status: 500, response: {} }))
    roadmap.mockResolvedValue(data())
    renderPage()
    expect(await screen.findByText("The roadmap didn't load.", {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByText("Nothing planned yet. The ideas with the most dots get here first.")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Dark mode")).toBeInTheDocument())
  })
})
