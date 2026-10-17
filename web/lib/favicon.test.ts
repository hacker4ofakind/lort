import { describe, expect, it } from "vitest"
import { favicon } from "@/lib/favicon"

describe("favicon", () => {
  it("uses the logo's 64x64 thumb", () => {
    expect(favicon({ appName: "Rookcut", logo: "/api/files/settings/s1/rook_ab12.png", primaryColor: "#b7791f" })).toEqual({
      url: "/api/files/settings/s1/rook_ab12.png?thumb=64x64",
      type: "image/png",
    })
  })

  it("links an SVG logo as it is: it scales on its own", () => {
    expect(favicon({ appName: "Rookcut", logo: "/api/files/settings/s1/rook.svg", primaryColor: "#b7791f" })).toEqual({
      url: "/api/files/settings/s1/rook.svg",
      type: "image/svg+xml",
    })
  })

  it("draws the letter mark on the primary colour without a logo", () => {
    const icon = favicon({ appName: "driftnote", logo: "", primaryColor: "#cc3a6d" })
    expect(icon.type).toBe("image/svg+xml")
    const svg = decodeURIComponent(icon.url.replace("data:image/svg+xml,", ""))
    expect(svg).toContain('fill="#cc3a6d"')
    expect(svg).toContain(">D</text>")
  })

  it("escapes a letter that means something in SVG", () => {
    const svg = decodeURIComponent(favicon({ appName: "<b>", logo: "", primaryColor: "#cc3a6d" }).url)
    expect(svg).toContain(">&lt;</text>")
  })
})
