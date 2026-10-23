import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { EditorPost, RequestItem } from "@/lib/api"
import { DEFAULT_CONFIG } from "@/lib/config"
import { previewData, useEditorForm } from "@/components/dashboard/changelog/editor/use-editor-form"

const toast = vi.fn()
vi.mock("sonner", () => ({ toast: (m: string) => toast(m) }))

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
  revision: 3,
  body: "Hello",
  cover: "",
  excerpt: "",
  images: [],
  slugCustom: false,
  completeAttached: false,
  attached: [],
  ...over,
})

beforeEach(() => toast.mockReset())

describe("useEditorForm", () => {
  it("seeds once and lets a refetch move only the server's fields", () => {
    const { result, rerender } = renderHook(({ p }) => useEditorForm(p), { initialProps: { p: post() } })
    act(() => result.current.edit({ title: "Dark mode, typed" }))
    rerender({ p: post({ title: "Old title from the server", state: "scheduled", publishAt: "2026-10-23T09:00:00Z", slug: "x" }) })
    expect(result.current.form.title).toBe("Dark mode, typed")
    expect(result.current.server.state).toBe("scheduled")
    expect(result.current.server.slug).toBe("x")
    expect(result.current.version).toBe(0)
    expect(toast).not.toHaveBeenCalled()
  })

  it("reseeds from the server when a refetch shows it went live, with a toast when it differed", () => {
    const { result, rerender } = renderHook(({ p }) => useEditorForm(p), { initialProps: { p: post() } })
    act(() => result.current.edit({ body: "Hello, and one more line" }))
    rerender({ p: post({ state: "published", publishedAt: "2026-10-22T09:00:00Z" }) })
    expect(result.current.server.state).toBe("published")
    expect(result.current.form.body).toBe("Hello")
    expect(result.current.version).toBe(1)
    expect(toast).toHaveBeenCalledWith("It went live before your last change saved.")
  })

  it("says nothing when the live copy matches", () => {
    const { result, rerender } = renderHook(({ p }) => useEditorForm(p), { initialProps: { p: post() } })
    rerender({ p: post({ state: "published", publishedAt: "2026-10-22T09:00:00Z" }) })
    expect(result.current.version).toBe(1)
    expect(toast).not.toHaveBeenCalled()
  })
})

describe("previewData", () => {
  it("shows only the requests the public would see", () => {
    const r = (id: string, board: string, visible: boolean) => ({ id, board: { id: board, name: board }, visible }) as RequestItem
    const p = post({ attached: [r("a", "pub", true), r("b", "pub", false), r("c", "private", true)], cover: "c.png" })
    const { result } = renderHook(() => useEditorForm(p))
    const data = previewData("p1", result.current.form, result.current.server, { ...DEFAULT_CONFIG, boards: [{ id: "pub", name: "Features" }] })
    expect(data.shipped.map((s) => s.id)).toEqual(["a"])
    expect(data.coverUrl).toBe("/api/files/changelogs/p1/c.png?thumb=1600x0")
    expect(data.date).toBeUndefined()
  })
})
