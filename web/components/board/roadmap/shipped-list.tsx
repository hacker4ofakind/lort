"use client"

import Link from "next/link"
import { useInfiniteQuery } from "@tanstack/react-query"
import { IconArrowLeft } from "@tabler/icons-react"
import { useConfig } from "@/app/providers"
import { LoadMore } from "@/components/board/load-more"
import { RoadmapItem } from "@/components/board/roadmap/roadmap-item"
import { RoadmapOff } from "@/components/board/roadmap/roadmap-off"
import { Bone } from "@/components/lort/bone"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { shipped } from "@/lib/api"
import { isNotFound } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { useLiveRefresh } from "@/lib/realtime"

/** /roadmap/shipped: everything that has shipped, newest first. */
export function ShippedList() {
  const config = useConfig()
  return config.roadmapPublic ? <ShippedBody /> : <RoadmapOff />
}

function ShippedBody() {
  const config = useConfig()
  const list = useInfiniteQuery({
    queryKey: keys.shipped,
    queryFn: ({ pageParam }) => shipped(pb, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.totalItems ? last.page + 1 : undefined),
    retry: (count, err) => !isNotFound(err) && count < 1,
  })
  useLiveRefresh(pb, "requests", [keys.shipped])

  if (isNotFound(list.error)) return <RoadmapOff />

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  return (
    <main className="mx-auto max-w-[860px] px-4 pt-3.5 sm:px-8 sm:pt-9">
      <Link href="/roadmap" className="inline-flex items-center gap-1.5 rounded-md text-label text-muted-foreground hover:text-foreground">
        <IconArrowLeft className="size-4" aria-hidden />
        Roadmap
      </Link>
      <h1 className="mt-3 font-display text-[32px] leading-[34px] font-extrabold tracking-[-0.03em] text-balance sm:text-display-xl">
        Everything {config.appName} has shipped
      </h1>
      <p className="mt-2 mb-[22px] max-w-[60ch] text-body text-ink-2 sm:mt-3 sm:mb-8 sm:text-body-lg">
        Newest first. Thanks to everyone who stuck a dot on these.
      </p>

      {list.isPending ? (
        <div aria-busy="true" aria-label="Loading what has shipped" className="flex flex-col gap-2.5">
          {["62%", "48%", "70%", "55%"].map((w, i) => (
            <div key={i} className="flex gap-3 rounded-lg border bg-card px-4 py-3.5">
              <Bone w={40} h={40} />
              <div className="flex flex-1 flex-col gap-2.5 pt-1">
                <Bone w={w} h={15} />
                <Bone w={150} h={18} />
              </div>
            </div>
          ))}
        </div>
      ) : list.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>The roadmap didn&apos;t load.</EmptyTitle>
          </EmptyHeader>
          <Button variant="secondary" onClick={() => list.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing has shipped yet. It&apos;s coming.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <RoadmapItem key={item.id} item={item} column="completed" />
          ))}
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onVisible={() => list.fetchNextPage()} />
        </div>
      )}
    </main>
  )
}
