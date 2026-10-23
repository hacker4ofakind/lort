import { act, renderHook } from "@testing-library/react"
import { ClientResponseError } from "pocketbase"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DraftPatch, SavedDraft } from "@/lib/api"
import { useAutosave } from "@/components/dashboard/changelog/editor/use-autosave"

const updateDraft = vi.fn<(patch: DraftPatch, rev: number) => Promise<SavedDraft>>()
const addImage = vi.fn<(file: File, rev: number) => Promise<SavedDraft>>()
const removeImages = vi.fn<(names: string[], rev: number) => Promise<SavedDraft>>()
const authListeners: Array<() => void> = []
const auth = { isValid: true }

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  updateDraft: (_c: unknown, _id: string, patch: DraftPatch, rev: number) => updateDraft(patch, rev),
  addImage: (_c: unknown, _id: string, file: File, rev: number) => addImage(file, rev),
  removeImages: (_c: unknown, _id: string, names: string[], rev: number) => removeImages(names, rev),
}))
vi.mock("@/lib/pocketbase", () => ({
  pbAdmin: {
    authStore: {
      get isValid() {
        return auth.isValid
      },
      onChange: (fn: () => void) => {
        authListeners.push(fn)
        return () => authListeners.splice(authListeners.indexOf(fn), 1)
      },
    },
  },
}))

let rev = 0
const saved = (over: Partial<SavedDraft> = {}): SavedDraft => ({
  slug: "dark-mode",
  updated: "",
  state: "draft",
  images: [],
  cover: "",
  revision: ++rev,
  ...over,
})
const fail = (status: number, data: Record<string, unknown> = {}, message = "Bad") =>
  new ClientResponseError({ status, response: { status, message, data } })

/** A promise and the functions that settle it. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const setup = (images: string[] = []) => renderHook(() => useAutosave("p1", { revision: 0, images }))
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  rev = 0
  auth.isValid = true
  authListeners.length = 0
  updateDraft.mockReset().mockImplementation(async () => saved())
  addImage.mockReset()
  removeImages.mockReset()
})
afterEach(() => vi.useRealTimers())

describe("useAutosave: batching and order", () => {
  it("sends one save for typing within a second, and labels at once", async () => {
    const { result } = setup()
    act(() => {
      result.current.save({ title: "D" })
      result.current.save({ title: "Da" })
    })
    await tick(500)
    act(() => result.current.save({ title: "Dark" }))
    await tick(999)
    expect(updateDraft).not.toHaveBeenCalled()
    await tick(1)
    expect(updateDraft).toHaveBeenCalledTimes(1)
    expect(updateDraft).toHaveBeenLastCalledWith({ title: "Dark" }, 0)
    expect(result.current.status).toBe("saved")
    expect(result.current.revision).toBe(1)

    act(() => result.current.save({ labels: ["new"] }))
    await tick(0)
    expect(updateDraft).toHaveBeenLastCalledWith({ labels: ["new"] }, 1)
  })

  it("keeps one request in flight, so an older save can't land after a newer one", async () => {
    const first = deferred<SavedDraft>()
    updateDraft.mockImplementationOnce(() => first.promise)
    const { result } = setup()
    act(() => result.current.save({ labels: ["new"] }))
    await tick(0)
    act(() => result.current.save({ labels: ["fixed"] }))
    await tick(5000)
    expect(updateDraft).toHaveBeenCalledTimes(1)
    await act(async () => first.resolve(saved()))
    await tick(0)
    expect(updateDraft).toHaveBeenCalledTimes(2)
    expect(updateDraft).toHaveBeenLastCalledWith({ labels: ["fixed"] }, 1)
  })
})

describe("useAutosave: errors", () => {
  it("retries a 500 and recovers", async () => {
    updateDraft.mockRejectedValueOnce(fail(500))
    const { result } = setup()
    act(() => result.current.save({ labels: ["new"] }, { now: true }))
    await tick(0)
    expect(result.current.status).toBe("error")
    expect(result.current.announce).toBe("Couldn't save. Trying again…")
    await tick(2000)
    expect(updateDraft).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe("saved")
    expect(result.current.announce).toBe("Saved")
  })

  it("saves the body when the slug next to it is refused", async () => {
    updateDraft.mockRejectedValueOnce(
      fail(400, { slug: { code: "validation_invalid_slug", message: "Another post already uses this address." } })
    )
    const { result } = setup()
    act(() => {
      result.current.save({ body: "Hello" })
      result.current.save({ slug: "taken" })
    })
    await tick(50)
    await tick(50)
    expect(updateDraft).toHaveBeenCalledTimes(2)
    expect(updateDraft).toHaveBeenLastCalledWith({ body: "Hello" }, 0)
    expect(result.current.fieldError.slug).toBe("Another post already uses this address.")
    expect(result.current.status).toBe("saved")
  })

  it("keeps a body the server refused as unsaved work while the other fields save", async () => {
    updateDraft.mockRejectedValueOnce(fail(400, { body: { code: "validation_max_text_constraint", message: "Must be no more than 100000 character(s)." } }))
    const { result } = setup()
    act(() => {
      result.current.save({ body: "way too long" })
      result.current.save({ title: "Dark mode" })
    })
    await tick(1000)
    await tick(10)
    expect(updateDraft).toHaveBeenLastCalledWith({ title: "Dark mode" }, 0)
    expect(result.current.status).toBe("error")
    expect(result.current.message).toBe("Must be no more than 100000 character(s).")
    expect(result.current.dirty()).toBe(true)
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)

    // Fixing the body sends it again and clears the block.
    act(() => result.current.save({ body: "short" }))
    await tick(1000)
    expect(updateDraft).toHaveBeenLastCalledWith({ body: "short" }, 1)
    expect(result.current.status).toBe("saved")
    expect(result.current.dirty()).toBe(false)
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(true)
  })

  it("lets discard() drop a refused field", async () => {
    updateDraft.mockRejectedValueOnce(fail(400, { body: { message: "Too long." } }))
    const { result } = setup()
    act(() => result.current.save({ body: "way too long" }, { now: true }))
    await tick(0)
    expect(result.current.dirty()).toBe(true)
    act(() => result.current.discard())
    expect(result.current.dirty()).toBe(false)
  })

  it("keeps the whole patch while signed out and resends after signing in", async () => {
    updateDraft.mockRejectedValueOnce(fail(401))
    const { result } = setup()
    act(() => result.current.save({ body: "Long paragraph" }, { now: true }))
    await tick(0)
    expect(result.current.status).toBe("signed-out")
    act(() => result.current.save({ title: "More" }))
    await tick(30_000)
    expect(updateDraft).toHaveBeenCalledTimes(1)
    act(() => authListeners.forEach((l) => l()))
    await tick(0)
    expect(updateDraft).toHaveBeenLastCalledWith({ body: "Long paragraph", title: "More" }, 0)
    expect(result.current.status).toBe("saved")
  })

  it("stops on an edit conflict and keeps the patch", async () => {
    updateDraft.mockRejectedValueOnce(fail(409, {}, "This post changed in another window. Reload to see it."))
    const { result } = setup()
    act(() => result.current.save({ body: "Mine" }, { now: true }))
    await tick(0)
    expect(result.current.status).toBe("conflict")
    act(() => result.current.save({ title: "Also mine" }))
    await tick(30_000)
    expect(updateDraft).toHaveBeenCalledTimes(1)
    expect(result.current.dirty()).toBe(true)
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)
  })
})

describe("useAutosave: revision", () => {
  it("advances from its own save answers and lifecycle calls", async () => {
    const { result } = setup()
    act(() => result.current.save({ labels: ["new"] }))
    await tick(0)
    expect(result.current.revision).toBe(1)
    act(() => result.current.setRevision(7))
    act(() => result.current.save({ labels: ["fixed"] }))
    await tick(0)
    expect(updateDraft).toHaveBeenLastCalledWith({ labels: ["fixed"] }, 7)
  })

  it("pause() holds saves until resume()", async () => {
    const { result } = setup()
    act(() => result.current.pause())
    act(() => result.current.save({ labels: ["new"] }))
    await tick(5000)
    expect(updateDraft).not.toHaveBeenCalled()
    act(() => result.current.resume())
    await tick(0)
    expect(updateDraft).toHaveBeenCalledTimes(1)
  })
})

describe("useAutosave: uploads", () => {
  it("sends each upload as its own request and resolves each to its own file", async () => {
    addImage.mockResolvedValueOnce(saved({ images: ["a_1.png"] })).mockResolvedValueOnce(saved({ images: ["a_1.png", "b_2.png"] }))
    const { result } = setup()
    let a: Promise<string> | undefined
    let b: Promise<string> | undefined
    act(() => {
      a = result.current.upload(new File(["a"], "a.png"))
      b = result.current.upload(new File(["b"], "b.png"))
    })
    await tick(0)
    await tick(0)
    await expect(a).resolves.toBe("a_1.png")
    await expect(b).resolves.toBe("b_2.png")
    expect(addImage).toHaveBeenCalledTimes(2)
    expect(addImage.mock.calls[1][1]).toBe(1)
  })

  it("makes room at 30 images by removing the ones the body no longer uses", async () => {
    const names = Array.from({ length: 30 }, (_, i) => `i${i}.png`)
    removeImages.mockResolvedValue(saved({ images: names.slice(0, 29) }))
    addImage.mockResolvedValue(saved({ images: [...names.slice(0, 29), "new.png"] }))
    const md = names.slice(0, 29).map((n) => `![](/api/files/changelogs/p1/${n})`).join("\n")
    const { result } = renderHook(() => useAutosave("p1", { revision: 0, images: names }, { getMarkdown: () => md }))
    let up: Promise<string> | undefined
    act(() => {
      up = result.current.upload(new File(["x"], "new.png"))
    })
    await tick(0)
    await expect(up).resolves.toBe("new.png")
    expect(removeImages).toHaveBeenCalledWith(["i29.png"], 0)
  })
  describe("while the server has refused the body", () => {
    const TOO_LONG = "Must be no more than 100000 character(s)."
    const refuseBody = async (result: { current: ReturnType<typeof useAutosave> }) => {
      updateDraft.mockRejectedValueOnce(fail(400, { body: { message: TOO_LONG } }))
      act(() => result.current.save({ body: "way too long" }, { now: true }))
      await tick(10)
      expect(result.current.status).toBe("error")
    }

    it("keeps the error showing when an image upload is refused too", async () => {
      addImage.mockRejectedValueOnce(fail(413, {}, "Too big."))
      const { result } = setup()
      await refuseBody(result)
      let up: Promise<string> | undefined
      act(() => {
        up = result.current.upload(new File(["x"], "x.png"))
        up.catch(() => undefined)
      })
      await tick(10)
      await expect(up).rejects.toThrow("Too big.")
      expect(result.current.status).toBe("error")
      expect(result.current.message).toBe(TOO_LONG)
      expect(result.current.uploading).toBe(false)
    })

    it("keeps the error showing when a full post can't take another image", async () => {
      const names = Array.from({ length: 30 }, (_, i) => `i${i}.png`)
      const md = names.map((n) => `![](/api/files/changelogs/p1/${n})`).join("\n")
      const { result } = renderHook(() => useAutosave("p1", { revision: 0, images: names }, { getMarkdown: () => md }))
      await refuseBody(result)
      let up: Promise<string> | undefined
      act(() => {
        up = result.current.upload(new File(["x"], "new.png"))
        up.catch(() => undefined)
      })
      await tick(10)
      await expect(up).rejects.toThrow("A post can hold 30 images.")
      expect(result.current.status).toBe("error")
      expect(result.current.message).toBe(TOO_LONG)
      expect(result.current.dirty()).toBe(true)
    })

    it("still shows Saved once the refused body is fixed", async () => {
      const { result } = setup()
      await refuseBody(result)
      act(() => result.current.save({ body: "short" }, { now: true }))
      await tick(10)
      expect(result.current.status).toBe("saved")
    })
  })
})

describe("useAutosave: flush, unmount and discard", () => {
  it("flush resolves true once the queue drains", async () => {
    const { result } = setup()
    act(() => result.current.save({ body: "Hi" }))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(true)
    expect(updateDraft).toHaveBeenCalledWith({ body: "Hi" }, 0)
  })

  it("flush resolves false after a 400 and while signed out", async () => {
    updateDraft.mockRejectedValueOnce(fail(400, {}, "Something is off."))
    const { result } = setup()
    act(() => result.current.save({ body: "Hi" }))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)
    expect(result.current.message).toBe("Something is off.")

    updateDraft.mockRejectedValueOnce(fail(401))
    act(() => result.current.save({ body: "Again" }))
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)
    expect(result.current.status).toBe("signed-out")
  })

  it("flush resolves false after one failed retry", async () => {
    updateDraft.mockRejectedValue(fail(0))
    const { result } = setup()
    act(() => result.current.save({ body: "Hi" }))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)
    expect(updateDraft).toHaveBeenCalledTimes(2)
  })

  it("unmounting still sends the pending patch", async () => {
    const { result, unmount } = setup()
    act(() => result.current.save({ body: "Last words" }))
    unmount()
    await tick(0)
    expect(updateDraft).toHaveBeenCalledWith({ body: "Last words" }, 0)
  })

  it("discard() drops what is pending, so delete sends nothing more", async () => {
    const { result, unmount } = setup()
    act(() => result.current.save({ body: "Gone" }))
    act(() => result.current.discard())
    unmount()
    await tick(5000)
    expect(updateDraft).not.toHaveBeenCalled()
  })
})
