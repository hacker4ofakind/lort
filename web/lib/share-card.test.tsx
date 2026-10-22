// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/lib/config"
import type { PageMeta } from "@/lib/page-meta"
import { drawable, shareCard } from "@/lib/share-card"

const meta = (title: string): PageMeta => ({ title, description: "", url: "http://x/changelog/a", image: "", appName: "Driftnote" })
const config = { ...DEFAULT_CONFIG, appName: "Driftnote" }
const PNG = [0x89, 0x50, 0x4e, 0x47]

describe("drawable", () => {
  it("keeps Latin text and drops emoji and other scripts", () => {
    expect(drawable("Dark mode 🎉")).toBe("Dark mode")
    expect(drawable("Тёмная тема")).toBe("")
    expect(drawable("Café – “crème” brûlée’s ŁÓDŹ")).toBe("Café – “crème” brûlée’s ŁÓDŹ")
  })
})

describe("shareCard", () => {
  // No network while drawing: a fetch for a fallback font or Twemoji fails the test.
  beforeEach(() => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("no network while drawing")))
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(["Dark mode 🎉", "Тёмная тема", "A very long title that goes on and on about everything the team shipped this month, and then some more"])(
    "draws a PNG for %s without the network",
    async (title) => {
      const res = await shareCard(meta(title), config, `slug-${title.length}`, null)
      expect(res.status).toBe(200)
      expect(res.headers.get("Content-Type")).toBe("image/png")
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=300")
      expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)]).toEqual(PNG)
    },
    30_000
  )

  it("serves a second request from memory and answers 304 to a matching ETag", async () => {
    const first = await shareCard(meta("Faster search"), config, "faster-search", null)
    const etag = first.headers.get("ETag")
    expect(etag).toBeTruthy()
    const t0 = performance.now()
    const again = await shareCard(meta("Faster search"), config, "faster-search", null)
    expect(performance.now() - t0).toBeLessThan(50)
    expect(again.headers.get("ETag")).toBe(etag)
    expect((await again.arrayBuffer()).byteLength).toBe((await first.arrayBuffer()).byteLength)
    const cached = await shareCard(meta("Faster search"), config, "faster-search", etag)
    expect(cached.status).toBe(304)
    const renamed = await shareCard(meta("Faster search"), { ...config, appName: "Other" }, "faster-search", etag)
    expect(renamed.status).toBe(200)
  }, 30_000)
})
