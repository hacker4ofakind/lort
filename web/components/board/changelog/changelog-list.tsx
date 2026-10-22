"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useConfig } from "@/app/providers"
import { ChangelogEntry } from "@/components/board/changelog/changelog-entry"
import { ChangelogSkeleton } from "@/components/board/changelog/changelog-skeleton"
import { LoadMore } from "@/components/board/load-more"
import { Segmented } from "@/components/lort/segmented"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { listPosts } from "@/lib/api"
import { isLabel, labelName, LABELS } from "@/lib/changelog"
import { pb } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

const FILTERS = [{ value: "all", label: "All" }, ...LABELS]

/** /changelog: every published post, newest first, with a label filter in the URL (?label=). */
export function ChangelogList() {
  const config = useConfig()
  const router = useRouter()
  const pathname = usePathname()
  const raw = useSearchParams().get("label") ?? ""
  const label = isLabel(raw) ? raw : ""

  // push, not replace: Back returns to the previous filter.
  const setLabel = (v: string) => router.push(v === "all" ? pathname : `${pathname}?label=${v}`, { scroll: false })

  const list = useInfiniteQuery({
    queryKey: keys.changelog(label),
    queryFn: ({ pageParam }) => listPosts(pb, label, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.totalItems ? last.page + 1 : undefined),
    refetchOnWindowFocus: true,
  })
  const posts = list.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <main className="mx-auto max-w-[860px] px-4 pt-3.5 sm:px-8 sm:pt-9">
      <h1 className="font-display text-[32px] leading-[34px] font-extrabold tracking-[-0.03em] text-balance sm:text-display-xl">
        What&apos;s new in {config.appName}
      </h1>
      <p className="mt-2 mb-[18px] max-w-[60ch] text-body text-ink-2 sm:mt-3 sm:mb-[26px] sm:text-body-lg">
        Everything the team shipped, newest first.
      </p>
      <div className="mb-2 max-w-full overflow-x-auto">
        <Segmented aria-label="Filter by label" options={FILTERS} value={label || "all"} onValueChange={setLabel} />
      </div>

      {list.isPending ? (
        <ChangelogSkeleton />
      ) : list.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>The changelog didn&apos;t load.</EmptyTitle>
          </EmptyHeader>
          <Button variant="secondary" onClick={() => list.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : posts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {label
                ? `No posts labelled ${labelName(label)} yet.`
                : "Nothing here yet. When the team ships something, it'll show up here."}
            </EmptyTitle>
          </EmptyHeader>
          {label && (
            <Button variant="ghost" onClick={() => setLabel("all")}>
              Show all posts
            </Button>
          )}
        </Empty>
      ) : (
        <div className="border-b">
          {posts.map((p) => (
            <ChangelogEntry key={p.id} post={p} />
          ))}
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onVisible={() => list.fetchNextPage()} />
        </div>
      )}
    </main>
  )
}
