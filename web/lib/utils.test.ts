import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("keeps Lort's text sizes next to text colours", () => {
    expect(cn("text-label font-bold", "text-primary-foreground")).toBe("text-label font-bold text-primary-foreground")
    expect(cn("text-label", "text-caption")).toBe("text-caption")
  })

  it("treats Lort's shadows as shadows", () => {
    expect(cn("shadow-float", "shadow-sticker")).toBe("shadow-sticker")
    expect(cn("inset-shadow-sm shadow-float", "shadow-card-float")).toBe("inset-shadow-sm shadow-card-float")
  })

  it("is the only cn components use", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && /from ["']cn["']/.test(readFileSync(p, "utf8"))) offenders.push(p)
      }
    }
    walk(join(process.cwd(), "components"))
    expect(offenders).toEqual([])
  })
})
