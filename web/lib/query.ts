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

/** Every shape a "requests" query caches: a paged list, one page (the merge picker) or an array (similar). */
type CachedRequests = InfiniteData<Page<RequestItem>> | Page<RequestItem> | RequestItem[]

/**
 * Applies patch to request id wherever it is cached: board and team lists, the merge picker,
 * similar results and detail pages.
 */
export function patchRequest(qc: QueryClient, id: string, patch: Patch) {
  const each = <T extends RequestItem>(r: T): T => (r.id === id ? { ...r, ...patch(r) } : r)
  const page = (p: Page<RequestItem>) => ({ ...p, items: p.items.map(each) })
  qc.setQueriesData<CachedRequests>({ queryKey: ["requests"] }, (data) => {
    if (!data) return data
    if (Array.isArray(data)) return data.map(each)
    if ("pages" in data) return { ...data, pages: data.pages.map(page) }
    return page(data)
  })
  qc.setQueriesData<RequestDetail>({ queryKey: ["request"] }, (d) => (d && d.id === id ? each(d) : d))
}

/** Request id as it is cached right now (any list shape or its detail page), if it is. */
export function cachedRequest(qc: QueryClient, id: string): RequestItem | undefined {
  for (const [, data] of qc.getQueriesData<CachedRequests>({ queryKey: ["requests"] })) {
    if (!data) continue
    const items = Array.isArray(data) ? data : "pages" in data ? data.pages.flatMap((p) => p.items) : data.items
    const found = items.find((r) => r.id === id)
    if (found) return found
  }
  for (const [, d] of qc.getQueriesData<RequestDetail>({ queryKey: ["request"] })) if (d?.id === id) return d
  return undefined
}

/** The optimistic side of a vote toggle. */
export function toggledVote(r: RequestItem): RequestItem {
  return { ...r, voted: !r.voted, votes: Math.max(0, r.votes + (r.voted ? -1 : 1)) }
}
