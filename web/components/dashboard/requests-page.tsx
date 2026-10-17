"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { IconChevronDown, IconPlus, IconRotateClockwise, IconSearch } from "@tabler/icons-react"
import { useConfig } from "@/app/providers"
import { LoadMore } from "@/components/board/load-more"
import { SuggestDialog } from "@/components/board/suggest-dialog"
import { RequestsTableSkeleton } from "@/components/dashboard/requests-skeleton"
import { RequestsTable } from "@/components/dashboard/requests-table"
import { useBoards } from "@/components/dashboard/use-boards"
import { Bone } from "@/components/lort/bone"
import { FilterMenu } from "@/components/lort/filter-menu"
import { STATUS_OPTIONS } from "@/components/lort/floating-bar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { listRequests, stats } from "@/lib/api"
import { apiParams, parseTableFilters, tableSearch, type TableFilters, type TableSort } from "@/lib/filters"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { useLiveRefresh } from "@/lib/realtime"
import { OPEN_STATUSES, type Status } from "@/lib/status"
import { useCooldown } from "@/lib/use-cooldown"

const SORTS: { value: TableSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "top", label: "Most upvoted" },
  { value: "updated", label: "Recently updated" },
]

const openSummary = (v: string[]) =>
  v.length === OPEN_STATUSES.length && OPEN_STATUSES.every((s) => v.includes(s)) ? "Open" : undefined

/** /dashboard/requests: counts, filters (all in the URL), the table, realtime and a rate-limited refresh. */
export function RequestsPage() {
  const config = useConfig()
  const router = useRouter()
  const pathname = usePathname()
  const qc = useQueryClient()
  const filters = parseTableFilters(useSearchParams())
  const params = apiParams(filters)
  const search = tableSearch(filters)
  const boards = useBoards()
  const [newOpen, setNewOpen] = useState(false)
  const [fresh, setFresh] = useState<string[]>([])
  const [q, setQ] = useState(filters.q)
  const [ready, startCooldown] = useCooldown(10_000)

  const setFilters = (next: Partial<TableFilters>) =>
    router.replace(`${pathname}${tableSearch({ ...filters, ...next })}`, { scroll: false })
  // Search: the URL follows the field 300 ms after the last key.
  const urlQ = filters.q
  useEffect(() => {
    if (q === urlQ) return
    const t = setTimeout(() => router.replace(`${pathname}${tableSearch({ ...parseTableFilters(new URLSearchParams(window.location.search)), q })}`, { scroll: false }), 300)
    return () => clearTimeout(t)
  }, [q, urlQ, pathname, router])

  const counts = useQuery({ queryKey: keys.stats, queryFn: () => stats(pbAdmin) })
  const list = useInfiniteQuery({
    queryKey: keys.requests("team", params),
    queryFn: ({ pageParam }) => listRequests(pbAdmin, params, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.totalItems ? last.page + 1 : undefined),
  })

  const onCreate = (id: string) => {
    setFresh((f) => [...f, id])
    setTimeout(() => setFresh((f) => f.filter((x) => x !== id)), 4000)
  }
  const { live } = useLiveRefresh(pbAdmin, "requests", [["requests", "team"], keys.stats], onCreate)

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const total = list.data?.pages[0]?.totalItems ?? 0
  const visibility = filters.visibility ? [filters.visibility] : []

  return (
    <main className="px-4 pt-6 pb-14 sm:px-10 sm:pt-[30px]">
      <div className="mx-auto max-w-[1060px]">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[30px] font-extrabold tracking-[-0.025em]">Requests</h1>
          {counts.data ? (
            <span className="mt-1.5 text-label font-normal text-muted-foreground">
              {counts.data.total} total · {counts.data.waiting} waiting for you
            </span>
          ) : (
            <Bone w={190} h={14} className="mt-1.5" />
          )}
          <span className="flex-1" />
          {live && <span className="text-caption font-normal text-muted-foreground">Live</span>}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            disabled={!ready}
            onClick={() => {
              startCooldown()
              void qc.invalidateQueries({ queryKey: ["requests", "team"] })
              void qc.invalidateQueries({ queryKey: keys.stats })
            }}
          >
            <IconRotateClockwise />
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <IconPlus stroke={2.4} />
            New request
          </Button>
        </div>

        <div className="mt-[22px] mb-4 flex flex-wrap items-center gap-2">
          <InputGroup className="h-[42px] w-full sm:w-[280px]">
            <InputGroupAddon>
              <IconSearch className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search titles and details"
              aria-label="Search requests"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </InputGroup>
          <FilterMenu
            allLabel="Every status"
            noun="statuses"
            options={STATUS_OPTIONS}
            selected={filters.status}
            onSelectedChange={(v) => setFilters({ status: v as Status[] })}
            summarize={openSummary}
          />
          <FilterMenu
            allLabel="All boards"
            noun="boards"
            options={(boards.data ?? []).map((b) => ({ value: b.id, label: b.isPublic ? b.name : `${b.name} (private)` }))}
            selected={filters.board}
            onSelectedChange={(board) => setFilters({ board })}
          />
          {config.tags.length > 0 && (
            <FilterMenu
              allLabel="Any tag"
              noun="tags"
              options={config.tags.map((t) => ({ value: t.id, label: t.name }))}
              selected={filters.tag}
              onSelectedChange={(tag) => setFilters({ tag })}
            />
          )}
          <FilterMenu
            allLabel="Public and hidden"
            noun="kinds"
            options={[
              { value: "public", label: "On the board" },
              { value: "hidden", label: "Hidden" },
            ]}
            selected={visibility}
            onSelectedChange={(v) => setFilters({ visibility: v.length === 1 ? (v[0] as "public" | "hidden") : "" })}
          />
          <span className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" />}>
              {SORTS.find((s) => s.value === filters.sort)?.label}
              <IconChevronDown className="size-[15px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuRadioGroup value={filters.sort} onValueChange={(v) => setFilters({ sort: v as TableSort })}>
                {SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s.value} value={s.value}>
                    {s.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {list.isPending ? (
          <RequestsTableSkeleton />
        ) : items.length === 0 ? (
          <Empty className="rounded-lg border bg-card">
            <EmptyHeader>
              <EmptyTitle>{search ? "Nothing matches these filters" : "No requests yet"}</EmptyTitle>
              <EmptyDescription>
                {search ? "Try another search or clear the filters." : "When people suggest something, it lands here first."}
              </EmptyDescription>
            </EmptyHeader>
            {search && (
              <Button variant="secondary" onClick={() => router.replace(pathname, { scroll: false })}>
                Clear filters
              </Button>
            )}
          </Empty>
        ) : (
          <>
            <RequestsTable items={items} search={search} fresh={fresh} />
            <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onVisible={() => list.fetchNextPage()} />
            <p className="mx-1 mt-3.5 text-caption font-normal text-muted-foreground">
              Showing {items.length} of {total}
              {list.hasNextPage ? ". Scroll for more." : "."}
            </p>
          </>
        )}
      </div>
      <SuggestDialog open={newOpen} onOpenChange={setNewOpen} team boards={boards.data ?? []} />
    </main>
  )
}
