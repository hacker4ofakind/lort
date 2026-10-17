import { describe, expect, it } from "vitest"
import { brandCss, contrast, deriveBrand, GROUNDS, MIN_CONTRAST } from "@/lib/colors"

const PRESETS = ["#cc3a6d", "#d4553a", "#b7791f", "#2f855a", "#0f8a8a", "#2563eb", "#7c4dcc", "#4b5563"]

describe("deriveBrand", () => {
  it("finds readable text for every preset, changing the colour only when it must", () => {
    for (const hex of PRESETS) {
      const b = deriveBrand(hex)
      expect(contrast(b.primary, b.onPrimary)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
    expect(deriveBrand("#cc3a6d").primary).toBe("#cc3a6d")
    expect(deriveBrand("#2563eb").primary).toBe("#2563eb")
    // Coral reaches 4.5:1 with neither white nor ink, so its lightness moves a little.
    expect(deriveBrand("#d4553a").primary).not.toBe("#d4553a")
  })

  it("uses white on Lort Pink and ink on Amber", () => {
    expect(deriveBrand("#cc3a6d").onPrimary).toBe("#ffffff")
    expect(deriveBrand("#b7791f").onPrimary).toBe("#1e1a18")
  })

  it("nudges a colour that neither white nor ink can sit on", () => {
    const b = deriveBrand("#777777")
    expect(b.primary).not.toBe("#777777")
    expect(contrast(b.primary, b.onPrimary)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it("makes primary-text readable on both grounds of each theme", () => {
    for (const hex of [...PRESETS, "#ffee00", "#101010"]) {
      const { primaryText } = deriveBrand(hex)
      for (const g of GROUNDS.light) expect(contrast(primaryText.light, g)).toBeGreaterThanOrEqual(MIN_CONTRAST)
      for (const g of GROUNDS.dark) expect(contrast(primaryText.dark, g)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it("falls back to Lort Pink for garbage", () => {
    expect(deriveBrand("red").primary).toBe("#cc3a6d")
  })
})

describe("brandCss", () => {
  it("writes both themes", () => {
    expect(brandCss("#2563eb")).toMatch(
      /^:root\{--primary:#2563eb;--primary-foreground:#ffffff;--primary-text:#[0-9a-f]{6}\}\.dark\{/
    )
  })
})
