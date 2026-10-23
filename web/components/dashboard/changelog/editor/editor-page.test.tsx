import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClientProvider } from "@tanstack/react-query"
import { ClientResponseError } from "pocketbase"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EditorPage } from "@/components/dashboard/changelog/editor/editor-page"
import type { DraftPatch, EditorPost, PublishResult, SavedDraft } from "@/lib/api"
import { DEFAULT_CONFIG } from "@/lib/config"
import { makeQueryClient } from "@/lib/query"

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => {}

const push = vi.fn()
const toast = vi.hoisted(() => Object.assign(vi.fn(), { dismiss: vi.fn(), custom: vi.fn() }))
const editorPost = vi.fn<() => Promise<EditorPost>>()
const updateDraft = vi.fn<(patch: DraftPatch) => Promise<SavedDraft>>()
const publishPost = vi.fn<() => Promise<PublishResult>>()
const deletePost = vi.fn<() => Promise<void>>()
const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/providers", () => ({ useConfig: () => DEFAULT_CONFIG }))
vi.mock("sonner", () => ({ toast }))
vi.mock("@/lib/pocketbase", () => ({ pbAdmin: { authStore: { token: "t", isValid: true, onChange: () => () => {} } } }))
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  editorPost: () => editorPost(),
  updateDraft: (_c: unknown, _id: string, patch: DraftPatch) => updateDraft(patch),
  publishPost: () => publishPost(),
  deletePost: () => deletePost(),
}))

const post = (over: Partial<EditorPost> = {}): EditorPost => ({
  id: "p1",
  title: "Dark mode",
  slug: "dark-mode",
  state: "draft",
  labels: [],
  publishAt: null,
  publishedAt: null,
  updated: null,
  requests: 0,
  author: { id: "", name: "", avatar: "", team: false },
  publishError: "",
  revision: 0,
  body: "Hello",
  cover: "",
  excerpt: "",
  images: [],
  slugCustom: false,
  completeAttached: false,
  attached: [],
  ...over,
})

function renderEditor() {
  const qc = makeQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return render(<EditorPage id="p1" />, { wrapper })
}

beforeEach(() => {
  for (const f of [push, toast, editorPost, updateDraft, publishPost, deletePost, fetchMock]) f.mockReset()
  fetchMock.mockImplementation(() => Promise.resolve(new Response("{}")))
  vi.stubGlobal("fetch", fetchMock)
  updateDraft.mockResolvedValue({ slug: "dark-mode", updated: "", state: "draft", images: [], cover: "", revision: 1 })
})
afterEach(() => vi.unstubAllGlobals())

describe("EditorPage", () => {
  it("makes a published post read-only, with Unpublish and no primary button", async () => {
    editorPost.mockResolvedValue(post({ state: "published", publishedAt: "2026-10-09T09:00:00Z" }))
    renderEditor()
    expect(await screen.findByText("This post is live. Unpublish it to make changes.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull()
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("readonly")
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull()
    expect(screen.getAllByRole("textbox", { name: "Post address" })[0]).toBeDisabled()
  })

  it("stops Publish now while the last change hasn't saved", async () => {
    editorPost.mockResolvedValue(post())
    updateDraft.mockRejectedValue(new ClientResponseError({ status: 400, response: { message: "Something is off.", data: {} } }))
    renderEditor()
    const title = await screen.findByRole("textbox", { name: "Title" })
    await userEvent.type(title, "!")
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(await screen.findByRole("button", { name: /Publish now/ }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Your last changes haven't saved yet."))
    expect(publishPost).not.toHaveBeenCalled()
  })

  it("offers Delete for a draft, and goes back to the list after it", async () => {
    editorPost.mockResolvedValue(post({ title: "" }))
    deletePost.mockResolvedValue()
    renderEditor()
    await userEvent.click(await screen.findByRole("button", { name: "More actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete post" }))
    expect(await screen.findByText("Delete this untitled post?")).toBeInTheDocument()
    expect(screen.getByText("It's gone for good, along with its images.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Delete post" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/changelog"))
    expect(deletePost).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith("Post deleted.")
  })

  it("deletes a brand-new post left untouched, and keeps one with a label", async () => {
    editorPost.mockResolvedValue(post({ title: "", slug: "", body: "" }))
    const first = renderEditor()
    await screen.findByRole("textbox", { name: "Title" })
    first.unmount()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/collections/changelogs/records/p1",
      expect.objectContaining({ method: "DELETE", keepalive: true })
    )

    fetchMock.mockClear()
    const second = renderEditor()
    await userEvent.click(await screen.findByRole("button", { name: "New" }))
    second.unmount()
    expect(fetchMock).not.toHaveBeenCalledWith("/api/collections/changelogs/records/p1", expect.anything())
  })

  it("keeps a post that was ever scheduled", async () => {
    editorPost.mockResolvedValue(post({ title: "", slug: "", body: "", state: "scheduled", publishAt: "2026-10-23T09:00:00Z" }))
    const r = renderEditor()
    await screen.findByRole("textbox", { name: "Title" })
    r.unmount()
    expect(fetchMock).not.toHaveBeenCalledWith("/api/collections/changelogs/records/p1", expect.anything())
  })
})
