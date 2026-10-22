"use client"

import { useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useInfiniteQuery, useMutation } from "@tanstack/react-query"
import { IconPlus, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"
import { LoadMore } from "@/components/board/load-more"
import { PostsSkeleton } from "@/components/dashboard/changelog/posts-skeleton"
import { PostsTable } from "@/components/dashboard/changelog/posts-table"
import { FilterMenu } from "@/components/lort/filter-menu"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { createPost, teamPosts } from "@/lib/api"
import { isLabel, LABELS } from "@/lib/changelog"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { clearUrlSearch, useUrlSearch } from "@/lib/use-url-search"

const STATES = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
]

export interface PostFilters {
  state: string[]
  label: string[]
  q: string
}

const csv = (v: string | null) => (v ? v.split(",").filter(Boolean) : [])

export function parsePostFilters(sp: URLSearchParams): PostFilters {
  return {
    state: csv(sp.get("state")).filter((s) => STATES.some((o) => o.value === s)),
    label: csv(sp.get("label")).filter(isLabel),
    q: sp.get("q") ?? "",
  }
}

/** The filters as a query string ("" for none), for the URL and the query key alike. */
export function postSearch(f: PostFilters): string {
  const p = new URLSearchParams()
  if (f.q) p.set("q", f.q)
  if (f.state.length) p.set("state", f.state.join(","))
  if (f.label.length) p.set("label", f.label.join(","))
  const s = p.toString()
  return s ? `?${s}` : ""
}

/** /dashboard/changelog: the posts, filters in the URL, and New post. */
export function PostsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const filters = parsePostFilters(useSearchParams())
  const search = postSearch(filters)
  const params = Object.fromEntries(new URLSearchParams(search))

  const setFilters = (next: Partial<PostFilters>) => router.replace(`${pathname}${postSearch({ ...filters, ...next })}`, { scroll: false })
  const [q, setQ] = useUrlSearch(filters.q, (q) =>
    router.replace(`${pathname}${postSearch({ ...parsePostFilters(new URLSearchParams(window.location.search)), q })}`, {
      scroll: false,
    })
  )

  const list = useInfiniteQuery({
    queryKey: keys.teamPosts(params),
    queryFn: ({ pageParam }) => teamPosts(pbAdmin, params, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.totalItems ? last.page + 1 : undefined),
  })

  // One post per click, however fast the clicks: the ref holds before React re-renders.
  const creating = useRef(false)
  const create = useMutation({
    mutationFn: () => createPost(pbAdmin),
    onSuccess: (id) => router.push(`/dashboard/changelog/${id}`),
    onError: (err) => {
      creating.current = false
      toast(errorMessage(err))
    },
  })
  const newPost = () => {
    if (creating.current) return
    creating.current = true
    create.mutate()
  }

  const posts = list.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <main className="px-4 pt-6 pb-14 sm:px-10 sm:pt-[30px]">
      <div className="mx-auto max-w-[1060px]">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[30px] font-extrabold tracking-[-0.025em]">Changelog</h1>
          <span className="mt-1.5 text-label font-normal text-muted-foreground">Tell people what you shipped.</span>
          <span className="flex-1" />
          <Button onClick={newPost} disabled={create.isPending}>
            <IconPlus stroke={2.4} />
            New post
          </Button>
        </div>

        <div className="mt-[22px] mb-4 flex flex-wrap items-center gap-2">
          <InputGroup className="h-[42px] w-full sm:w-[280px]">
            <InputGroupAddon>
              <IconSearch className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search posts"
              aria-label="Search posts"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </InputGroup>
          <FilterMenu
            allLabel="Any state"
            noun="states"
            options={STATES}
            selected={filters.state}
            onSelectedChange={(state) => setFilters({ state })}
          />
          <FilterMenu
            allLabel="Any label"
            noun="labels"
            options={LABELS}
            selected={filters.label}
            onSelectedChange={(label) => setFilters({ label })}
          />
        </div>

        {list.isPending ? (
          <PostsSkeleton />
        ) : list.isError ? (
          <Empty className="rounded-lg border bg-card">
            <EmptyHeader>
              <EmptyTitle>The posts didn&apos;t load.</EmptyTitle>
            </EmptyHeader>
            <Button variant="secondary" onClick={() => list.refetch()}>
              Try again
            </Button>
          </Empty>
        ) : posts.length === 0 ? (
          <Empty className="rounded-lg border bg-card">
            <EmptyHeader>
              <EmptyTitle>{search ? "No posts match these filters." : "No posts yet"}</EmptyTitle>
              {!search && <EmptyDescription>Write one when something ships. People love hearing what changed.</EmptyDescription>}
            </EmptyHeader>
            {search && (
              <Button
                variant="secondary"
                onClick={() => {
                  clearUrlSearch()
                  router.replace(pathname, { scroll: false })
                }}
              >
                Clear filters
              </Button>
            )}
          </Empty>
        ) : (
          <>
            <PostsTable posts={posts} />
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onVisible={() => list.fetchNextPage()} />
          </>
        )}
      </div>
    </main>
  )
}
