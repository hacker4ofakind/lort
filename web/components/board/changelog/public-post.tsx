"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { IconArrowLeft } from "@tabler/icons-react"
import { PostMissing } from "@/components/board/changelog/post-missing"
import { PostSkeleton } from "@/components/board/changelog/post-skeleton"
import { PostView } from "@/components/board/changelog/post-view"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { getPost } from "@/lib/api"
import { postFileUrl } from "@/lib/changelog"
import { isNotFound } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

/** /changelog/<slug>: one published post. */
export function PublicPost({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: keys.post(slug),
    queryFn: () => getPost(pb, slug),
    retry: (count, err) => !isNotFound(err) && count < 1,
    refetchOnWindowFocus: true,
  })
  const p = q.data

  return (
    <main className="mx-auto max-w-[760px] px-4 pt-6 pb-4 sm:px-8">
      <Link
        href="/changelog"
        className="mb-[26px] inline-flex items-center gap-1.5 rounded-md text-label text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" aria-hidden />
        Changelog
      </Link>
      {q.isPending ? (
        <PostSkeleton />
      ) : isNotFound(q.error) ? (
        <PostMissing />
      ) : q.isError || !p ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>This post didn&apos;t load.</EmptyTitle>
          </EmptyHeader>
          <Button variant="secondary" onClick={() => q.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : (
        <PostView
          title={p.title}
          labels={p.labels}
          date={p.publishedAt}
          coverUrl={p.cover ? `${postFileUrl(p.id, p.cover)}?thumb=1600x0` : undefined}
          body={p.body}
          shipped={p.shipped}
          share={p.slug}
        />
      )}
    </main>
  )
}
