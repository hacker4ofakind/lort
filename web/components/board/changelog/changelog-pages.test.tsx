import type { ReactNode } from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChangelogList } from "@/components/board/changelog/changelog-list"
import { PostView } from "@/components/board/changelog/post-view"
import type { Page, PostSummary, RequestItem } from "@/lib/api"
import { DEFAULT_CONFIG } from "@/lib/config"
import { makeQueryClient } from "@/lib/query"

const push = vi.fn()
let search = new URLSearchParams()
const listPosts = vi.fn<(label: string, page: number) => Promise<Page<PostSummary>>>()
const toast = vi.fn()

vi.mock("@/app/providers", () => ({ useConfig: () => ({ ...DEFAULT_CONFIG, appName: "Driftnote" }) }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/changelog",
  useSearchParams: () => search,
}))
vi.mock("sonner", () => ({ toast: (m: string) => toast(m) }))
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  listPosts: (_c: unknown, label: string, page: number) => listPosts(label, page),
}))

const summary = (over: Partial<PostSummary>): PostSummary => ({
  id: "p1",
  slug: "dark-mode",
  title: "Dark mode is here",
  excerpt: "Finally, a darker theme.",
  labels: ["new"],
  publishedAt: new Date(2026, 9, 9, 9).toISOString(),
  ...over,
})
const page = (items: PostSummary[]): Page<PostSummary> => ({ items, page: 1, perPage: 20, totalItems: items.length })

function renderList() {
  const qc = makeQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return render(<ChangelogList />, { wrapper })
}

beforeEach(() => {
  push.mockReset()
  toast.mockReset()
  listPosts.mockReset()
  search = new URLSearchParams()
})

describe("ChangelogList", () => {
  it("lists posts with date, chips, title and excerpt, each linking to its page", async () => {
    listPosts.mockResolvedValue(page([summary({}), summary({ id: "p2", slug: "faster-search", title: "Faster search", labels: ["fixed", "improved"] })]))
    renderList()
    expect(screen.getByRole("heading", { name: "What's new in Driftnote" })).toBeInTheDocument()
    const link = await screen.findByRole("link", { name: "Dark mode is here" })
    expect(link).toHaveAttribute("href", "/changelog/dark-mode")
    const entry = link.closest("article")!
    expect(entry).toHaveTextContent("09 Oct")
    expect(entry).toHaveTextContent("2026")
    expect(entry).toHaveTextContent("Finally, a darker theme.")
    const second = screen.getByRole("link", { name: "Faster search" }).closest("article")!
    expect(within(second).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Improved", "Fixed"])
  })

  it("writes the label filter to the URL", async () => {
    listPosts.mockResolvedValue(page([summary({})]))
    renderList()
    await screen.findByText("Dark mode is here")
    await userEvent.click(screen.getByRole("button", { name: "New" }))
    expect(push).toHaveBeenLastCalledWith("/changelog?label=new", { scroll: false })
  })

  it("All clears the filter", async () => {
    search = new URLSearchParams("label=fixed")
    listPosts.mockResolvedValue(page([summary({ labels: ["fixed"] })]))
    renderList()
    await screen.findByText("Dark mode is here")
    expect(listPosts).toHaveBeenCalledWith("fixed", 1)
    await userEvent.click(screen.getByRole("button", { name: "All" }))
    expect(push).toHaveBeenLastCalledWith("/changelog", { scroll: false })
  })

  it("says when there is nothing yet, or nothing with that label", async () => {
    listPosts.mockResolvedValue(page([]))
    const { unmount } = renderList()
    expect(await screen.findByText("Nothing here yet. When the team ships something, it'll show up here.")).toBeInTheDocument()
    unmount()

    search = new URLSearchParams("label=fixed")
    renderList()
    expect(await screen.findByText("No posts labelled Fixed yet.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show all posts" }))
    expect(push).toHaveBeenLastCalledWith("/changelog", { scroll: false })
  })
})

const shipped = (over: Partial<RequestItem>): RequestItem =>
  ({
    id: "r1",
    title: "Dark mode",
    status: "completed",
    votes: 12,
    voted: true,
    author: { id: "u1", name: "Ade O.", avatar: "", team: false },
    ...over,
  }) as RequestItem

describe("PostView", () => {
  it("shows chips in label order, the cover only when given, and the shipped section only when it has items", () => {
    const { container, rerender } = render(
      <PostView title="Dark mode" labels={["fixed", "new"]} body="Hello" shipped={[]} date={new Date(2026, 9, 9).toISOString()} />
    )
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["New", "Fixed"])
    expect(screen.getByText("9 October 2026")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByRole("heading", { name: "Shipped in this update" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Share this update" })).toBeNull()

    rerender(
      <PostView
        title="Dark mode"
        labels={[]}
        body="Hello"
        coverUrl="/api/files/changelogs/p1/c.png"
        shipped={[shipped({}), shipped({ id: "r2", title: "Gone author", author: { id: "", name: "", avatar: "", team: false } })]}
        share="dark-mode"
      />
    )
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/files/changelogs/p1/c.png")
    const section = screen.getByRole("region", { name: "Shipped in this update" })
    expect(within(section).getByRole("link", { name: "Dark mode" })).toHaveAttribute("href", "/feedback/r1")
    expect(within(section).getAllByText("Suggested by Ade O.").length).toBeGreaterThan(0)
    expect(within(section).getByRole("link", { name: "Gone author" }).closest("li")).not.toHaveTextContent("Suggested by")
  })

  it("Share copies the absolute address, and says when it can't", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<PostView title="Dark mode" labels={[]} body="" shipped={[]} share="dark-mode" />)
    await userEvent.click(screen.getByRole("button", { name: "Share this update" }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/changelog/dark-mode`)
    expect(toast).toHaveBeenLastCalledWith("Link copied.")

    writeText.mockRejectedValue(new Error("denied"))
    await userEvent.click(screen.getByRole("button", { name: "Share this update" }))
    expect(toast).toHaveBeenLastCalledWith("Couldn't copy the link.")
  })
})
