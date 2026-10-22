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

  it("adds Changelog after Roadmap once a post is published", () => {
    const labels = (c: Partial<typeof DEFAULT_CONFIG>) => boardNav({ ...DEFAULT_CONFIG, ...c }).map((l) => l.label)
    expect(labels({ changelog: true })).toEqual(["Feedback", "Roadmap", "Changelog"])
    expect(labels({ roadmapPublic: false, changelog: true })).toEqual(["Feedback", "Changelog"])
    expect(labels({ changelog: false })).toEqual(["Feedback", "Roadmap"])
    expect(boardNav({ ...DEFAULT_CONFIG, changelog: true })[2].href).toBe("/changelog")
  })
})
