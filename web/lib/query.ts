import {
  QueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query"
import type { Page, RequestDetail, RequestItem } from "@/lib/api"

/** Query keys. Every request list starts with "requests" so one invalidation refreshes them all. */
export const keys = {
  requests: (scope: "board" | "team", params?: Record<string, string>) =>
    ["requests", scope, params ?? {}] as const,
  request: (scope: "board" | "team", id: string) =>
    ["request", scope, id] as const,
  similar: (q: string) => ["requests", "similar", q] as const,
  queue: (params: Record<string, string>, id: string) =>
    ["queue", params, id] as const,
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
type CachedRequests =
  InfiniteData<Page<RequestItem>> | Page<RequestItem> | RequestItem[]

/** Applies patch to request id inside one cached value, whatever its shape. */
function patchCached<T>(data: T, id: string, patch: Patch): T {
  const each = <R extends RequestItem>(r: R): R =>
    r.id === id ? { ...r, ...patch(r) } : r
  const page = (p: Page<RequestItem>) => ({ ...p, items: p.items.map(each) })
  const d = data as CachedRequests | RequestDetail | undefined
  if (!d) return data
  if (Array.isArray(d)) return d.map(each) as T
  if ("pages" in d) return { ...d, pages: d.pages.map(page) } as T
  if ("items" in d) return page(d) as T
  return each(d) as T
}

/**
 * Applies patch to request id wherever it is cached: board and team lists, the merge picker,
 * similar results and detail pages.
 */
export function patchRequest(qc: QueryClient, id: string, patch: Patch) {
  qc.setQueriesData<CachedRequests>({ queryKey: ["requests"] }, (data) =>
    patchCached(data, id, patch)
  )
  qc.setQueriesData<RequestDetail>({ queryKey: ["request"] }, (d) =>
    d && d.id === id ? patchCached(d, id, patch) : d
  )
}

export type VoteFields = Pick<RequestItem, "voted" | "votes">

/** Request id's vote fields in each cached copy, by query: what a failed vote puts back. */
export function voteSnapshot(
  qc: QueryClient,
  id: string
): Array<[QueryKey, VoteFields]> {
  const out: Array<[QueryKey, VoteFields]> = []
  for (const [key, data] of qc.getQueriesData<CachedRequests>({
    queryKey: ["requests"],
  })) {
    if (!data) continue
    const items = Array.isArray(data)
      ? data
      : "pages" in data
        ? data.pages.flatMap((p) => p.items)
        : data.items
    const r = items.find((i) => i.id === id)
    if (r) out.push([key, { voted: r.voted, votes: r.votes }])
  }
  for (const [key, d] of qc.getQueriesData<RequestDetail>({
    queryKey: ["request"],
  })) {
    if (d?.id === id) out.push([key, { voted: d.voted, votes: d.votes }])
  }
  return out
}

/** Puts each cached copy's own vote fields back, leaving every other field and request as it is now. */
export function restoreVotes(
  qc: QueryClient,
  id: string,
  snapshot: Array<[QueryKey, VoteFields]>
) {
  for (const [key, fields] of snapshot)
    qc.setQueryData(key, (data: unknown) =>
      patchCached(data, id, (r) => ({ ...r, ...fields }))
    )
}

/** The optimistic side of a vote toggle. */
export function toggledVote(r: RequestItem): RequestItem {
  return {
    ...r,
    voted: !r.voted,
    votes: Math.max(0, r.votes + (r.voted ? -1 : 1)),
  }
}
