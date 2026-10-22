import {
  QueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query"
import type { Page, RequestDetail, RequestItem, Roadmap } from "@/lib/api"

/** Query keys. Every request list starts with "requests" so one invalidation refreshes them all. */
export const keys = {
  requests: (scope: "board" | "team", params?: Record<string, string>) =>
    ["requests", scope, params ?? {}] as const,
  request: (scope: "board" | "team", id: string) =>
    ["request", scope, id] as const,
  similar: (q: string) => ["requests", "similar", q] as const,
  queue: (params: Record<string, string>, id: string) =>
    ["queue", params, id] as const,
  roadmap: (scope: "board" | "team") => ["requests", "roadmap", scope] as const,
  shipped: ["requests", "shipped"] as const,
  stats: ["stats"] as const,
  team: ["team"] as const,
  boards: ["boards"] as const,
  tags: ["tags"] as const,
  settings: ["settings"] as const,
  user: (id: string) => ["user", id] as const,
  // Changelog keys never start with "requests", so the request cache walkers skip them.
  changelog: (label: string) => ["changelog", label] as const,
  post: (slug: string) => ["changelog", "post", slug] as const,
  teamPosts: (params: Record<string, string>) => ["changelogs", params] as const,
  editorPost: (id: string) => ["changelogs", "post", id] as const,
  failedPosts: ["changelogs", "failed"] as const,
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
    },
  })
}

type Patch = (r: RequestItem) => RequestItem

/**
 * Every shape a "requests" query caches: a paged list, one page (the merge picker), an array
 * (similar), the roadmap's three columns, or one request (a detail page).
 */
type CachedRequests =
  | InfiniteData<Page<RequestItem>>
  | Page<RequestItem>
  | RequestItem[]
  | Roadmap
  | RequestDetail

const isObject = (d: unknown): d is Record<string, unknown> => typeof d === "object" && d !== null

/** The one place that knows what each cached shape looks like. An unknown shape has no items. */
export function itemsOf(data: unknown): RequestItem[] {
  if (Array.isArray(data)) return data
  if (!isObject(data)) return []
  if (Array.isArray(data.pages)) return (data.pages as Page<RequestItem>[]).flatMap((p) => p.items)
  if (Array.isArray(data.items)) return data.items as RequestItem[]
  if (Array.isArray(data.planned)) {
    const rm = data as unknown as Roadmap
    return [...rm.planned, ...rm.progress, ...rm.completed]
  }
  if (typeof data.id === "string") return [data as unknown as RequestItem]
  return []
}

/** data with fn applied to every request in it. A shape it doesn't know comes back unchanged. */
export function mapItems<T>(data: T, fn: (r: RequestItem) => RequestItem): T {
  const d: unknown = data
  const each = (rs: RequestItem[]) => rs.map(fn)
  if (Array.isArray(d)) return each(d) as T
  if (!isObject(d)) return data
  if (Array.isArray(d.pages))
    return { ...d, pages: (d.pages as Page<RequestItem>[]).map((p) => ({ ...p, items: each(p.items) })) } as T
  if (Array.isArray(d.items)) return { ...d, items: each(d.items as RequestItem[]) } as T
  if (Array.isArray(d.planned)) {
    const rm = d as unknown as Roadmap
    return { ...rm, planned: each(rm.planned), progress: each(rm.progress), completed: each(rm.completed) } as T
  }
  if (typeof d.id === "string") return fn(d as unknown as RequestItem) as T
  return data
}

/** Applies patch to request id inside one cached value, whatever its shape. */
function patchCached<T>(data: T, id: string, patch: Patch): T {
  return mapItems(data, (r) => (r.id === id ? { ...r, ...patch(r) } : r))
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
    const r = itemsOf(data).find((i) => i.id === id)
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
