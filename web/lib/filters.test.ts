import { describe, expect, it } from "vitest"
import { apiParams, boardSearch, parseBoardFilters, parseTableFilters, tableSearch } from "@/lib/filters"
import { OPEN_STATUSES } from "@/lib/status"

const params = (s: string) => new URLSearchParams(s)

describe("board filters", () => {
  it("defaults to trending open ideas with a clean URL", () => {
    const f = parseBoardFilters(params(""))
    expect(f).toEqual({ sort: "trending", status: OPEN_STATUSES, board: [], q: "" })
    expect(boardSearch(f)).toBe("")
  })

  it("round-trips every field", () => {
    const s = "?sort=newest&status=completed%2Cclosed&board=b1%2Cb2&q=dark+mode"
    expect(boardSearch(parseBoardFilters(params(s)))).toBe(s)
  })

  it("keeps a cleared status filter apart from the default", () => {
    const f = parseBoardFilters(params("status=all"))
    expect(f.status).toEqual([])
    expect(boardSearch(f)).toBe("?status=all")
    expect(apiParams(f).status).toBeUndefined()
  })

  it("drops unknown values", () => {
    expect(parseBoardFilters(params("sort=weird&status=pending,nope")).status).toEqual(["pending"])
  })
})

describe("table filters", () => {
  it("round-trips and builds API params", () => {
    const s = "?sort=top&board=b1&tag=t1%2Ct2&visibility=hidden&q=crash"
    const f = parseTableFilters(params(s))
    expect(tableSearch(f)).toBe(s)
    expect(apiParams(f)).toEqual({
      sort: "top",
      status: OPEN_STATUSES.join(","),
      board: "b1",
      tag: "t1,t2",
      visibility: "hidden",
      q: "crash",
    })
  })
})
