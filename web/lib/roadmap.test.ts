import { afterEach, describe, expect, it, vi } from "vitest"
import type { RequestItem, Roadmap } from "@/lib/api"
import {
  COLLAPSED_KEY,
  ROADMAP_COLUMNS,
  moveCard,
  parseCollapsed,
  readCollapsed,
  whenText,
  writeCollapsed,
} from "@/lib/roadmap"

const now = new Date("2026-10-16T12:00:00Z")

const item = (id: string, votes: number, created = "2026-09-01T00:00:00Z", changed = created) =>
  ({ id, votes, created, statusChangedAt: changed, status: "planned" }) as RequestItem

const board = (): Roadmap => ({
  planned: [item("p1", 9), item("p2", 4), item("p3", 1)],
  progress: [item("g1", 5)],
  completed: [item("c1", 0, "2026-09-01T00:00:00Z", "2026-10-10T00:00:00Z")],
  shipped: 7,
})

const ids = (items: RequestItem[]) => items.map((i) => i.id)

describe("ROADMAP_COLUMNS", () => {
  it("lists the three columns in board order with their copy", () => {
    expect(ROADMAP_COLUMNS.map((c) => c.status)).toEqual(["planned", "progress", "completed"])
    expect(ROADMAP_COLUMNS.map((c) => c.label)).toEqual(["Planned", "In progress", "Completed"])
    expect(ROADMAP_COLUMNS[0].dropHint).toBe("Drop to plan it")
    expect(ROADMAP_COLUMNS[2].blurb).toBe("Shipped in the last 30 days.")
  })
})

describe("whenText", () => {
  it("says how long ago a card entered its column", () => {
    const at = (iso: string) => ({ statusChangedAt: iso }) as RequestItem
    expect(whenText(at("2026-09-25T12:00:00Z"), "planned", now)).toBe("Planned 3 weeks ago")
    expect(whenText(at("2026-10-12T12:00:00Z"), "progress", now)).toBe("Started 4 days ago")
    expect(whenText(at("2026-10-09T08:00:00Z"), "completed", now)).toBe("Shipped 09 Oct")
    expect(whenText(at("2026-10-16T11:59:50Z"), "planned", now)).toBe("Planned just now")
  })
})

describe("moveCard", () => {
  const at = new Date("2026-10-16T12:00:00Z")

  it("places a card by votes in Planned and removes it from its old column", () => {
    const next = moveCard(board(), "g1", "planned", at)
    expect(ids(next.planned)).toEqual(["p1", "g1", "p2", "p3"])
    expect(next.progress).toEqual([])
    expect(next.planned[1]).toMatchObject({ status: "planned", statusChangedAt: at.toISOString() })
  })

  it("breaks vote ties with the newer request first", () => {
    const b = board()
    b.planned = [item("new", 2, "2026-08-01T00:00:00Z"), item("old", 2, "2026-01-01T00:00:00Z")]
    b.progress = [item("mid", 2, "2026-05-01T00:00:00Z")]
    expect(ids(moveCard(b, "mid", "planned", at).planned)).toEqual(["new", "mid", "old"])
  })

  it("puts a card at the top of Completed and counts it as shipped", () => {
    const next = moveCard(board(), "p3", "completed", at)
    expect(ids(next.completed)).toEqual(["p3", "c1"])
    expect(next.shipped).toBe(8)
    expect(next.planned.map((i) => i.id)).toEqual(["p1", "p2"])
  })

  it("takes a card out of Completed and stops counting it as shipped", () => {
    const next = moveCard(board(), "c1", "progress", at)
    expect(ids(next.progress)).toEqual(["g1", "c1"])
    expect(next.completed).toEqual([])
    expect(next.shipped).toBe(6)
  })

  it("never mutates the roadmap it was given", () => {
    const b = board()
    const frozen = JSON.stringify(b)
    moveCard(b, "p1", "completed", at)
    expect(JSON.stringify(b)).toBe(frozen)
  })

  it("returns the same roadmap for an unknown card or the card's own column", () => {
    const b = board()
    expect(moveCard(b, "nope", "planned", at)).toBe(b)
    expect(moveCard(b, "p1", "planned", at)).toBe(b)
  })
})

describe("collapsed columns", () => {
  afterEach(() => vi.restoreAllMocks())

  it("reads nothing collapsed by default and round-trips a write", () => {
    expect(readCollapsed()).toEqual([])
    writeCollapsed(["completed", "planned"])
    expect(readCollapsed()).toEqual(["completed", "planned"])
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe('["completed","planned"]')
  })

  it("reads none collapsed when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(readCollapsed()).toEqual([])
  })

  it("ignores junk, unknown statuses and duplicates", () => {
    expect(parseCollapsed("not json")).toEqual([])
    expect(parseCollapsed('{"a":1}')).toEqual([])
    expect(parseCollapsed('["planned","bogus",3,"planned"]')).toEqual(["planned"])
    localStorage.setItem(COLLAPSED_KEY, "}{")
    expect(readCollapsed()).toEqual([])
  })

  it("does not throw when writing to blocked storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full")
    })
    expect(() => writeCollapsed(["planned"])).not.toThrow()
  })
})
