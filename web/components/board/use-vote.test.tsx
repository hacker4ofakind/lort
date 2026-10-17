import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider, type InfiniteData } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { useVote } from "@/components/board/use-vote"
import type { Page, RequestItem } from "@/lib/api"
import { pb } from "@/lib/pocketbase"
import { keys, makeQueryClient } from "@/lib/query"

const pending: Record<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }> = {}
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  vote: (_c: unknown, id: string) => new Promise((resolve, reject) => (pending[id] = { resolve, reject })),
}))
vi.mock("sonner", () => ({ toast: vi.fn() }))

function token() {
  const part = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, "")
  return `${part({ alg: "HS256" })}.${part({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

describe("useVote", () => {
  it("rolls back only the vote that failed", async () => {
    pb.authStore.save(token(), { id: "u1", collectionName: "users", name: "Mara" } as never)
    const qc = makeQueryClient()
    const item = (id: string, votes: number) => ({ id, votes, voted: false }) as RequestItem
    const page: Page<RequestItem> = { items: [item("a", 3), item("b", 1)], page: 1, perPage: 20, totalItems: 2 }
    qc.setQueryData(keys.requests("board", {}), { pages: [page], pageParams: [1] })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useVote(), { wrapper })
    const items = () => qc.getQueryData<InfiniteData<Page<RequestItem>>>(keys.requests("board", {}))!.pages[0].items

    act(() => result.current("a"))
    await waitFor(() => expect(pending.a).toBeDefined())
    act(() => result.current("b"))
    await waitFor(() => expect(pending.b).toBeDefined())
    await act(async () => pending.b.resolve({ voted: true, votes: 2 }))
    await act(async () => pending.a.reject(new Error("offline")))

    await waitFor(() => expect(items()[0]).toMatchObject({ id: "a", votes: 3, voted: false }))
    expect(items()[1]).toMatchObject({ id: "b", votes: 2, voted: true })
  })
})
