"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useConfig } from "@/app/providers"
import { FeedbackListSkeleton } from "@/components/board/feedback-skeleton"
import { FiltersSheet } from "@/components/board/filters-sheet"
import { LoadMore } from "@/components/board/load-more"
import { RequestCard } from "@/components/board/request-card"
import { SuggestDialog } from "@/components/board/suggest-dialog"
import { useVote } from "@/components/board/use-vote"
import { FloatingBar } from "@/components/lort/floating-bar"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { listRequests } from "@/lib/api"
import { apiParams, boardSearch, parseBoardFilters, type BoardFilters } from "@/lib/filters"
import { pb } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { useLiveRefresh } from "@/lib/realtime"
import { OPEN_STATUSES } from "@/lib/status"

const FRESH_MS = 4000

/** /feedback (and /): the headline, the request list and the floating bar. Filters live in the URL. */
export function FeedbackBoard() {
  const config = useConfig()
  const router = useRouter()
  const pathname = usePathname()
  const filters = parseBoardFilters(useSearchParams())
  const params = apiParams(filters)
  const onVote = useVote()
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [fresh, setFresh] = useState<string[]>([])

  const setFilters = (next: Partial<BoardFilters>) =>
    router.replace(`${pathname}${boardSearch({ ...filters, ...next })}`, { scroll: false })

  const list = useInfiniteQuery({
    queryKey: keys.requests("board", params),
    queryFn: ({ pageParam }) => listRequests(pb, params, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.totalItems ? last.page + 1 : undefined),
  })

  // useLiveRefresh keeps the latest callback in a ref, so this needn't be memoised.
  const onCreate = (id: string) => {
    setFresh((f) => [...f, id])
    setTimeout(() => setFresh((f) => f.filter((x) => x !== id)), FRESH_MS)
  }
  useLiveRefresh(pb, "requests", [["requests", "board"]], onCreate)

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const filtered =
    filters.q !== "" || filters.board.length > 0 || filters.status.join() !== OPEN_STATUSES.join()

  return (
    <main className="mx-auto max-w-[860px] px-4 pt-3.5 sm:px-8 sm:pt-9">
      <h1 className="font-display text-[32px] leading-[34px] font-extrabold tracking-[-0.03em] text-balance sm:text-display-xl">
        Got an idea for {config.appName}?
      </h1>
      <p className="mt-2 mb-[18px] max-w-[60ch] text-body text-ink-2 sm:mt-3 sm:mb-[30px] sm:text-body-lg">
        Stick a dot on the ones you want most.
        <span className="max-sm:hidden"> The team builds what gets the most dots, and tells you when it ships.</span>
      </p>

      {list.isPending ? (
        <FeedbackListSkeleton />
      ) : list.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>The ideas didn&apos;t load</EmptyTitle>
            <EmptyDescription>Check your connection, then try again.</EmptyDescription>
          </EmptyHeader>
          <Button variant="secondary" onClick={() => list.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{filtered ? "No ideas match these filters" : "Nothing here yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered ? "Try another search or clear the filters." : `Be the first to suggest something for ${config.appName}.`}
            </EmptyDescription>
          </EmptyHeader>
          {filtered && (
            <Button variant="secondary" onClick={() => router.replace(pathname, { scroll: false })}>
              Clear filters
            </Button>
          )}
        </Empty>
      ) : (
        <div className="flex flex-col gap-2.5 sm:gap-3">
          {items.map((r) => (
            <RequestCard key={r.id} request={r} onVote={onVote} fresh={fresh.includes(r.id)} />
          ))}
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onVisible={() => list.fetchNextPage()} />
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-7">
        <div className="pointer-events-auto">
          <FloatingBar
            boards={config.boards}
            sort={filters.sort}
            onSortChange={(sort) => setFilters({ sort })}
            selectedBoards={filters.board}
            onSelectedBoardsChange={(board) => setFilters({ board })}
            selectedStatuses={filters.status}
            onSelectedStatusesChange={(status) => setFilters({ status })}
            onSuggest={() => setSuggestOpen(true)}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </div>
      </div>
      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        boards={config.boards}
        selectedBoards={filters.board}
        onSelectedBoardsChange={(board) => setFilters({ board })}
        selectedStatuses={filters.status}
        onSelectedStatusesChange={(status) => setFilters({ status })}
      />
      <SuggestDialog open={suggestOpen} onOpenChange={setSuggestOpen} boards={config.boards} />
    </main>
  )
}
