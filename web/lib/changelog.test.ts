import { describe, expect, it } from "vitest"
import type { RequestItem, TeamPost } from "@/lib/api"
import { attachedToComplete, cleanSlugInput, referencedImages, scheduleAt, sortLabels, stateText } from "@/lib/changelog"

const post = (p: Partial<TeamPost>): TeamPost => ({
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
  revision: 0,
  ...p,
})

describe("sortLabels", () => {
  it("keeps New, Improved, Fixed order", () => {
    expect(sortLabels(["fixed", "new"])).toEqual(["new", "fixed"])
    expect(sortLabels(["improved", "fixed", "new"])).toEqual(["new", "improved", "fixed"])
  })
})

describe("stateText", () => {
  const now = new Date(2026, 9, 22, 12, 0)
  it("describes each state", () => {
    expect(stateText(post({ state: "draft", updated: new Date(2026, 9, 22, 11, 58).toISOString() }), now)).toBe(
      "Draft · edited 2 min ago"
    )
    expect(stateText(post({ state: "scheduled", publishAt: new Date(2026, 9, 21, 9, 0).toISOString() }), now)).toBe(
      "Scheduled · 21 Oct, 09:00"
    )
    expect(stateText(post({ state: "published", publishedAt: new Date(2026, 9, 9, 9, 0).toISOString() }), now)).toBe(
      "Published · 09 Oct"
    )
  })
})

describe("cleanSlugInput", () => {
  it("cleans as the person types", () => {
    expect(cleanSlugInput("Dark Mode ")).toBe("dark-mode-")
    expect(cleanSlugInput("Bad Address!")).toBe("bad-address")
    expect(cleanSlugInput("a--b")).toBe("a-b")
    expect(cleanSlugInput("Café")).toBe("caf")
  })
})

describe("scheduleAt", () => {
  it("builds the local wall-clock time", () => {
    const at = scheduleAt(new Date(2026, 9, 21), "09:30")
    expect(at?.getFullYear()).toBe(2026)
    expect(at?.getMonth()).toBe(9)
    expect(at?.getDate()).toBe(21)
    expect(at?.getHours()).toBe(9)
    expect(at?.getMinutes()).toBe(30)
  })

  it("refuses an empty or impossible time", () => {
    expect(scheduleAt(new Date(2026, 9, 21), "")).toBeNull()
    expect(scheduleAt(new Date(2026, 9, 21), "25:00")).toBeNull()
    expect(scheduleAt(new Date(2026, 9, 21), "09:60")).toBeNull()
  })
})

describe("referencedImages", () => {
  it("finds the names the body uses", () => {
    const md = "![](/api/files/changelogs/p1/a.png) ![x](/api/files/changelogs/p1/b.png?thumb=1600x0)"
    expect(referencedImages(md, ["a.png", "b.png", "c.png"])).toEqual(new Set(["a.png", "b.png"]))
  })

  it("ignores a name that is only the start of another", () => {
    expect(referencedImages("![](/api/files/changelogs/p1/a.png2)", ["a.png"])).toEqual(new Set())
  })
})

describe("attachedToComplete", () => {
  it("counts the requests a publish can complete", () => {
    const items = ["pending", "reviewing", "planned", "progress", "completed", "closed"].map(
      (status) => ({ id: status, status }) as RequestItem
    )
    expect(attachedToComplete(items)).toBe(4)
    expect(attachedToComplete([])).toBe(0)
  })
})
