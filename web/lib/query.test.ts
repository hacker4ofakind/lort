import { describe, expect, it } from "vitest"
import type { InfiniteData } from "@tanstack/react-query"
import type { Page, RequestDetail, RequestItem } from "@/lib/api"
import { keys, makeQueryClient, patchRequest, toggledVote } from "@/lib/query"

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
