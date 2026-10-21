import { describe, expect, it } from "vitest"
import { boardNav } from "@/components/board/links"
import { DEFAULT_CONFIG } from "@/lib/config"

describe("boardNav", () => {
  it("adds Roadmap only when the roadmap is public", () => {
    expect(boardNav({ ...DEFAULT_CONFIG, roadmapPublic: true })).toEqual([
      { href: "/feedback", label: "Feedback" },
      { href: "/roadmap", label: "Roadmap" },
    ])
    expect(boardNav({ ...DEFAULT_CONFIG, roadmapPublic: false })).toEqual([{ href: "/feedback", label: "Feedback" }])
  })
})
