import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FailedList } from "@/components/dashboard/changelog/failed-banner"
import { PostsPage } from "@/components/dashboard/changelog/posts-page"
import { PostsTable } from "@/components/dashboard/changelog/posts-table"
import { isDense } from "@/components/dashboard/dashboard-shell"
import type { Page, TeamPost } from "@/lib/api"
import { makeQueryClient } from "@/lib/query"

const push = vi.fn()
const replace = vi.fn()
let search = new URLSearchParams()
const teamPosts = vi.fn<(params: Record<string, string>) => Promise<Page<TeamPost>>>()
const createPost = vi.fn<() => Promise<string>>()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/dashboard/changelog",
  useSearchParams: () => search,
}))
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  teamPosts: (_c: unknown, params: Record<string, string>) => teamPosts(params),
  createPost: () => createPost(),
}))

const now = new Date(2026, 9, 22, 12, 0)
const post = (p: Partial<TeamPost>): TeamPost => ({
  id: "p1",
  title: "Dark mode",
  slug: "dark-mode",
  state: "draft",
  labels: [],
  publishAt: null,
  publishedAt: null,
  updated: new Date(2026, 9, 22, 11, 58).toISOString(),
  requests: 0,
  author: { id: "u1", name: "Luk", avatar: "", team: true },
  publishError: "",
  revision: 0,
  ...p,
})
const page = (items: TeamPost[]): Page<TeamPost> => ({ items, page: 1, perPage: 20, totalItems: items.length })

function renderPage() {
  const qc = makeQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return render(<PostsPage />, { wrapper })
}

beforeEach(() => {
  push.mockReset()
  replace.mockReset()
  teamPosts.mockReset()
  createPost.mockReset()
  search = new URLSearchParams()
})

describe("PostsTable", () => {
  it("shows each state with its dot, Untitled post and the attached count", () => {
    const { container } = render(
      <PostsTable
        now={now}
        posts={[
          post({ id: "a", title: "", requests: 0 }),
          post({ id: "b", title: "Scheduled one", state: "scheduled", publishAt: new Date(2026, 9, 23, 9).toISOString(), requests: 2 }),
          post({ id: "c", title: "Live one", state: "published", publishedAt: new Date(2026, 9, 9, 9).toISOString(), labels: ["new"] }),
        ]}
      />
    )
    expect(screen.getByRole("link", { name: "Untitled post" })).toHaveAttribute("href", "/dashboard/changelog/a")
    expect(screen.getAllByText("Draft · edited 2 min ago").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Scheduled · 23 Oct, 09:00").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Published · 09 Oct").length).toBeGreaterThan(0)
    expect(screen.getByText("2 attached")).toBeInTheDocument()
    expect(screen.getAllByText("None")).toHaveLength(2)
    expect(container.querySelector(".bg-primary")).not.toBeNull()
    expect(container.querySelector(".bg-ink-2")).not.toBeNull()
    expect(container.querySelector(".border-dot-empty")).not.toBeNull()
    expect(screen.getAllByRole("img", { name: "Luk (team)" }).length).toBe(3)
  })
})

describe("PostsPage", () => {
  it("writes the filters to the URL and Clear filters resets them", async () => {
    search = new URLSearchParams("state=draft")
    teamPosts.mockResolvedValue(page([]))
    renderPage()
    expect(await screen.findByText("No posts match these filters.")).toBeInTheDocument()
    expect(teamPosts).toHaveBeenCalledWith({ state: "draft" })
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(replace).toHaveBeenLastCalledWith("/dashboard/changelog", { scroll: false })

    await userEvent.click(screen.getByRole("button", { name: /Any label/ }))
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Fixed" }))
    expect(replace).toHaveBeenLastCalledWith("/dashboard/changelog?state=draft&label=fixed", { scroll: false })
  })

  it("says when there are no posts at all", async () => {
    teamPosts.mockResolvedValue(page([]))
    renderPage()
    expect(await screen.findByText("No posts yet")).toBeInTheDocument()
    expect(screen.getByText("Write one when something ships. People love hearing what changed.")).toBeInTheDocument()
  })

  it("makes one post on a double click and opens it", async () => {
    teamPosts.mockResolvedValue(page([post({})]))
    createPost.mockResolvedValue("new1")
    renderPage()
    await screen.findByRole("link", { name: "Dark mode" })
    await userEvent.dblClick(screen.getByRole("button", { name: "New post" }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/changelog/new1"))
    expect(createPost).toHaveBeenCalledTimes(1)
  })
})

describe("FailedList", () => {
  it("lists failed posts with a link, and nothing when there are none", () => {
    const { container, rerender } = render(<FailedList posts={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<FailedList posts={[{ id: "p9", title: "", publishAt: new Date(2026, 9, 21, 9).toISOString(), error: "No title" }]} />)
    expect(screen.getByText(/“Untitled post” didn't go out at 21 Oct, 09:00\. It's back in drafts\./)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open the post" })).toHaveAttribute("href", "/dashboard/changelog/p9")
  })
})

describe("isDense", () => {
  it("opens the rail on the editor but not on the list", () => {
    expect(isDense("/dashboard/changelog/abc")).toBe(true)
    expect(isDense("/dashboard/changelog")).toBe(false)
    expect(isDense("/dashboard/roadmap")).toBe(true)
    expect(isDense("/dashboard/requests/abc")).toBe(false)
  })
})
