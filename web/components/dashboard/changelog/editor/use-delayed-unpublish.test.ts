import { act, renderHook } from "@testing-library/react"
import { ClientResponseError } from "pocketbase"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TeamPost } from "@/lib/api"
import { useDelayedUnpublish } from "@/components/dashboard/changelog/editor/use-delayed-unpublish"

const unpublishPost = vi.fn<() => Promise<TeamPost>>()
const toast = vi.hoisted(() => Object.assign(vi.fn(), { dismiss: vi.fn() }))
let onUndo: (() => void) | undefined

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), unpublishPost: () => unpublishPost() }))
vi.mock("@/lib/pocketbase", () => ({ pbAdmin: { authStore: { token: "admin-token" } } }))
vi.mock("sonner", () => ({ toast }))
vi.mock("@/components/lort/undo-toast", () => ({
  undoToast: (o: { onUndo: () => void }) => {
    onUndo = o.onUndo
    return "t1"
  },
}))

const autosave = { pause: vi.fn(), resume: vi.fn(), discard: vi.fn() }
const handlers = { onDone: vi.fn(), onRestore: vi.fn() }
const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")))

const setup = () => renderHook(() => useDelayedUnpublish({ id: "p1", title: "Dark mode" }, autosave, handlers))
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchMock)
  for (const f of [unpublishPost, toast, toast.dismiss, autosave.pause, autosave.resume, autosave.discard, handlers.onDone, handlers.onRestore, fetchMock])
    f.mockClear()
  unpublishPost.mockReset().mockResolvedValue({ id: "p1", state: "draft" } as TeamPost)
  onUndo = undefined
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("useDelayedUnpublish", () => {
  it("looks unpublished at once, calls the server after 10 s, then sends the paused edits", async () => {
    const { result } = setup()
    act(() => result.current.unpublish())
    expect(result.current.pending).toBe(true)
    expect(autosave.pause).toHaveBeenCalled()
    await tick(9_999)
    expect(unpublishPost).not.toHaveBeenCalled()
    await tick(1)
    expect(unpublishPost).toHaveBeenCalledTimes(1)
    expect(autosave.resume).toHaveBeenCalled()
    expect(handlers.onDone).toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })

  it("Undo at 5 s sends nothing, drops the paused edits and goes back to read-only", async () => {
    const { result } = setup()
    act(() => result.current.unpublish())
    await tick(5000)
    act(() => onUndo?.())
    await tick(10_000)
    expect(unpublishPost).not.toHaveBeenCalled()
    expect(autosave.discard).toHaveBeenCalled()
    expect(handlers.onRestore).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith("Still live.")
    expect(result.current.pending).toBe(false)
  })

  it("leaving at 5 s sends the unpublish at once", async () => {
    const { result, unmount } = setup()
    act(() => result.current.unpublish())
    await tick(5000)
    unmount()
    expect(fetchMock).toHaveBeenCalledWith("/api/lort/changelogs/p1/unpublish", {
      method: "POST",
      keepalive: true,
      headers: { Authorization: "admin-token" },
    })
    await tick(10_000)
    expect(unpublishPost).not.toHaveBeenCalled()
  })

  it("counts a 409 as done", async () => {
    unpublishPost.mockRejectedValue(new ClientResponseError({ status: 409, response: { message: "That post isn't live." } }))
    const { result } = setup()
    act(() => result.current.unpublish())
    await tick(10_000)
    expect(handlers.onDone).toHaveBeenCalledWith(null)
    expect(handlers.onRestore).not.toHaveBeenCalled()
  })

  it("restores read-only with the error on any other failure", async () => {
    unpublishPost.mockRejectedValue(new ClientResponseError({ status: 500, response: { message: "Boom." } }))
    const { result } = setup()
    act(() => result.current.unpublish())
    await tick(10_000)
    expect(handlers.onRestore).toHaveBeenCalled()
    expect(autosave.discard).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith("Couldn't unpublish “Dark mode”. Boom.")
    expect(result.current.pending).toBe(false)
  })
})
