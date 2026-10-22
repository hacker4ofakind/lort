import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG, parseConfig } from "@/lib/config"

// Same encoding as the Go proxy: unpadded base64url of the JSON's UTF-8 bytes.
function encode(v: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(v))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

describe("parseConfig", () => {
  it("decodes the proxy header, including non-ASCII names", () => {
    const c = parseConfig(
      encode({ appName: "Driftnote ✨", primaryColor: "#2563eb", boards: [{ id: "b1", name: "Features" }] })
    )
    expect(c.appName).toBe("Driftnote ✨")
    expect(c.primaryColor).toBe("#2563eb")
    expect(c.boards).toEqual([{ id: "b1", name: "Features" }])
    expect(c.features).toEqual(DEFAULT_CONFIG.features)
    expect(c.changelog).toBe(false)
    expect(parseConfig(encode({ changelog: true })).changelog).toBe(true)
  })

  it("falls back to the defaults without a usable header", () => {
    expect(parseConfig(null)).toBe(DEFAULT_CONFIG)
    expect(parseConfig("%%%")).toBe(DEFAULT_CONFIG)
  })
})
