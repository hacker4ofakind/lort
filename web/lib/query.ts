import { QueryClient, type InfiniteData } from "@tanstack/react-query"
import type { Page, RequestDetail, RequestItem } from "@/lib/api"

/** Query keys. Every request list starts with "requests" so one invalidation refreshes them all. */
export const keys = {
  requests: (scope: "board" | "team", params?: Record<string, string>) => ["requests", scope, params ?? {}] as const,
  request: (scope: "board" | "team", id: string) => ["request", scope, id] as const,
  similar: (q: string) => ["requests", "similar", q] as const,
  queue: (params: Record<string, string>, id: string) => ["queue", params, id] as const,
  stats: ["stats"] as const,
  team: ["team"] as const,
  boards: ["boards"] as const,
  tags: ["tags"] as const,
  settings: ["settings"] as const,
  user: (id: string) => ["user", id] as const,
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
    },
  })
}

type Patch = (r: RequestItem) => RequestItem

/** Applies patch to request id wherever it is cached: board and team lists, similar results, detail pages. */
export function patchRequest(qc: QueryClient, id: string, patch: Patch) {
  const each = <T extends RequestItem>(r: T): T => (r.id === id ? { ...r, ...patch(r) } : r)
  qc.setQueriesData<InfiniteData<Page<RequestItem>> | RequestItem[]>({ queryKey: ["requests"] }, (data) => {
    if (!data) return data
    if (Array.isArray(data)) return data.map(each)
    return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map(each) })) }
  })
  qc.setQueriesData<RequestDetail>({ queryKey: ["request"] }, (d) => (d && d.id === id ? each(d) : d))
}

/** The optimistic side of a vote toggle. */
export function toggledVote(r: RequestItem): RequestItem {
  return { ...r, voted: !r.voted, votes: Math.max(0, r.votes + (r.voted ? -1 : 1)) }
}
