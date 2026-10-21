"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { IconArrowRight } from "@tabler/icons-react"
import { useConfig } from "@/app/providers"
import { PublicRoadmapSkeleton } from "@/components/board/roadmap/public-roadmap-skeleton"
import { RoadmapItem } from "@/components/board/roadmap/roadmap-item"
import { RoadmapOff } from "@/components/board/roadmap/roadmap-off"
import { StatusLabel } from "@/components/lort/status-icon"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { roadmap } from "@/lib/api"
import { isNotFound } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { useLiveRefresh } from "@/lib/realtime"
import { ROADMAP_COLUMNS } from "@/lib/roadmap"

/** /roadmap. With the roadmap off it shows the friendly message and asks the server for nothing. */
export function PublicRoadmap() {
  const config = useConfig()
  return config.roadmapPublic ? <RoadmapBody /> : <RoadmapOff />
}

function RoadmapBody() {
  const config = useConfig()
  const query = useQuery({
    queryKey: keys.roadmap("board"),
    queryFn: () => roadmap(pb),
    // A 404 means the team turned it off while this page was open: no point asking again.
    retry: (count, err) => !isNotFound(err) && count < 1,
  })
  useLiveRefresh(pb, "requests", [keys.roadmap("board")])

  if (isNotFound(query.error)) return <RoadmapOff />

  const rm = query.data
  return (
    <main className="mx-auto max-w-[1120px] px-4 pt-3.5 sm:px-8 sm:pt-9">
      <h1 className="font-display text-[32px] leading-[34px] font-extrabold tracking-[-0.03em] text-balance sm:text-display-xl">
        What&apos;s coming to {config.appName}?
      </h1>
      <p className="mt-2 mb-[22px] max-w-[60ch] text-body text-ink-2 sm:mt-3 sm:mb-8 sm:text-body-lg">
        Everything the team has committed to, what&apos;s being built right now, and what just shipped.
      </p>

      {query.isPending ? (
        <PublicRoadmapSkeleton />
      ) : query.isError || !rm ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>The roadmap didn&apos;t load.</EmptyTitle>
          </EmptyHeader>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-3">
          {ROADMAP_COLUMNS.map((col) => {
            const items = rm[col.status]
            return (
              <section
                key={col.status}
                aria-label={col.label}
                className="flex flex-col gap-2.5 rounded-xl bg-ground-sunken p-4 [--si-ground:var(--ground-sunken)]"
              >
                <div className="flex items-center gap-2.5 px-1 pt-0.5">
                  <StatusLabel status={col.status} size={20} keyline className="font-display text-title" />
                  <span className="rounded-full bg-surface-2 px-2.5 py-px text-[13px] font-bold text-muted-foreground">{items.length}</span>
                </div>
                <p className="mx-1 mb-1.5 text-[13px] text-muted-foreground">{col.blurb}</p>
                {items.length === 0 ? (
                  <p className="mx-1 mb-1 text-label font-normal text-muted-foreground">{col.emptyPublic}</p>
                ) : (
                  items.map((item) => <RoadmapItem key={item.id} item={item} column={col.status} />)
                )}
                {col.status === "completed" && rm.shipped > items.length && (
                  <Link
                    href="/roadmap/shipped"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-md px-1 py-2.5 text-[14px] font-semibold text-primary-text"
                  >
                    View all {rm.shipped} shipped
                    <IconArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
