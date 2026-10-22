"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { IconAlertTriangle } from "@tabler/icons-react"
import { failedPosts, type FailedPost } from "@/lib/api"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { dateTime } from "@/lib/time"

/** One line per scheduled post that didn't go out, on every dashboard page. */
export function FailedBanner() {
  const q = useQuery({
    queryKey: keys.failedPosts,
    queryFn: () => failedPosts(pbAdmin),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  return <FailedList posts={q.data ?? []} />
}

export function FailedList({ posts }: { posts: FailedPost[] }) {
  if (posts.length === 0) return null
  return (
    <div role="status" className="border-b bg-surface-2 px-4 py-2.5 sm:px-10">
      <ul className="mx-auto flex max-w-[1060px] flex-col gap-1.5">
        {posts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-label font-normal">
            <IconAlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
            <span className="min-w-0 flex-1">
              “{p.title || "Untitled post"}” didn&apos;t go out at {dateTime(p.publishAt)}. It&apos;s back in drafts.
            </span>
            <Link href={`/dashboard/changelog/${p.id}`} className="font-semibold text-primary-text underline underline-offset-[3px]">
              Open the post
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
