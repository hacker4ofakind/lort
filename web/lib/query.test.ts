import { describe, expect, it } from "vitest"
import type { InfiniteData } from "@tanstack/react-query"
import type { Page, RequestDetail, RequestItem, Roadmap } from "@/lib/api"
import { itemsOf, keys, makeQueryClient, patchRequest, restoreVotes, toggledVote, voteSnapshot } from "@/lib/query"

const item = (id: string, votes: number, voted = false) => ({ id, votes, voted }) as RequestItem

describe("patchRequest", () => {
  it("updates the request in lists, similar results and its detail page", () => {
    const qc = makeQueryClient()
    const page: Page<RequestItem> = { items: [item("a", 3), item("b", 1)], page: 1, perPage: 20, totalItems: 2 }
    qc.setQueryData(keys.requests("board", {}), { pages: [page], pageParams: [1] })
    qc.setQueryData(keys.similar("dark"), [item("a", 3)])
    qc.setQueryData(keys.request("board", "a"), { ...item("a", 3), thread: [] } as unknown as RequestDetail)

    patchRequest(qc, "a", toggledVote)

    const list = qc.getQueryData<InfiniteData<Page<RequestItem>>>(keys.requests("board", {}))!
    expect(list.pages[0].items.map((r) => [r.votes, r.voted])).toEqual([
      [4, true],
      [1, false],
    ])
    expect(qc.getQueryData<RequestItem[]>(keys.similar("dark"))![0].votes).toBe(4)
    expect(qc.getQueryData<RequestDetail>(keys.request("board", "a"))!.voted).toBe(true)
  })

  it("also updates a single page, like the merge picker's results", () => {
    const qc = makeQueryClient()
    const page: Page<RequestItem> = { items: [item("a", 3), item("b", 1)], page: 1, perPage: 20, totalItems: 2 }
    qc.setQueryData(keys.requests("team", { merge: "x" }), page)
    qc.setQueryData(keys.requests("board", {}), { pages: [page], pageParams: [1] })

    expect(() => patchRequest(qc, "a", toggledVote)).not.toThrow()

    expect(qc.getQueryData<Page<RequestItem>>(keys.requests("team", { merge: "x" }))!.items[0]).toMatchObject({ votes: 4, voted: true })
    const list = qc.getQueryData<InfiniteData<Page<RequestItem>>>(keys.requests("board", {}))!
    expect(list.pages[0].items[0]).toMatchObject({ votes: 4, voted: true })
  })
})

describe("a cached roadmap", () => {
  const roadmap = (): Roadmap => ({
    planned: [item("a", 3, false), item("b", 1)],
    progress: [item("c", 2)],
    completed: [item("d", 5, true)],
    shipped: 4,
  })

  it("is patched in place, leaving other requests alone", () => {
    const qc = makeQueryClient()
    qc.setQueryData(keys.roadmap("board"), roadmap())

    patchRequest(qc, "a", toggledVote)

    const rm = qc.getQueryData<Roadmap>(keys.roadmap("board"))!
    expect(rm.planned.map((r) => [r.id, r.votes, r.voted])).toEqual([
      ["a", 4, true],
      ["b", 1, false],
    ])
    expect(rm.progress[0].votes).toBe(2)
    expect(rm.shipped).toBe(4)
  })

  it("snapshots and restores a vote without touching later changes", () => {
    const qc = makeQueryClient()
    qc.setQueryData(keys.roadmap("board"), roadmap())

    const snap = voteSnapshot(qc, "a")
    expect(snap).toHaveLength(1)
    expect(snap[0][1]).toEqual({ voted: false, votes: 3 })

    patchRequest(qc, "a", toggledVote)
    patchRequest(qc, "c", toggledVote) // another request's vote lands meanwhile
    restoreVotes(qc, "a", snap)

    const rm = qc.getQueryData<Roadmap>(keys.roadmap("board"))!
    expect(rm.planned[0]).toMatchObject({ votes: 3, voted: false })
    expect(rm.progress[0]).toMatchObject({ votes: 3, voted: true })
  })

  it("finds requests in the shipped list's pages too", () => {
    const qc = makeQueryClient()
    const page: Page<RequestItem> = { items: [item("d", 5, true)], page: 1, perPage: 20, totalItems: 1 }
    qc.setQueryData(keys.shipped, { pages: [page], pageParams: [1] })
    expect(voteSnapshot(qc, "d")).toHaveLength(1)
  })

  it("leaves a shape it doesn't know unchanged instead of throwing", () => {
    const qc = makeQueryClient()
    const weird = { something: "else", n: 1 }
    qc.setQueryData(["requests", "weird"], weird)
    expect(() => patchRequest(qc, "a", toggledVote)).not.toThrow()
    expect(() => voteSnapshot(qc, "a")).not.toThrow()
    expect(() => restoreVotes(qc, "a", [[["requests", "weird"], { voted: true, votes: 1 }]])).not.toThrow()
    expect(qc.getQueryData(["requests", "weird"])).toEqual(weird)
    expect(itemsOf(weird)).toEqual([])
    expect(itemsOf(undefined)).toEqual([])
  })
})
