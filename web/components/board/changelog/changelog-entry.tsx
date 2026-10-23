import Link from "next/link"
import { LabelChips } from "@/components/board/changelog/label-chips"
import type { PostSummary } from "@/lib/api"
import { shortDate } from "@/lib/time"

/**
 * One post in the public list: the date in a gutter (above the content on phones), then labels,
 * title and excerpt. The title is the one link, stretched over the whole entry.
 */
export function ChangelogEntry({ post }: { post: PostSummary }) {
  const d = new Date(post.publishedAt)
  return (
    <article className="group relative grid gap-x-7 gap-y-2 border-t py-7 md:grid-cols-[150px_minmax(0,1fr)] has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-focus">
      <div className="md:pt-1">
        {/* The day and month; the year sits on its own line. */}
        <div className="text-label font-bold">{shortDate(post.publishedAt, d)}</div>
        <div className="mt-0.5 text-caption text-muted-foreground">{d.getFullYear()}</div>
      </div>
      <div className="min-w-0">
        <LabelChips labels={post.labels} className="mb-2.5" />
        <h2 className="font-display text-title font-extrabold tracking-[-0.02em] text-balance group-hover:text-primary-text sm:text-[26px] sm:leading-[31px]">
          <Link href={`/changelog/${post.slug}`} className="outline-none after:absolute after:inset-0">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="mt-2 line-clamp-2 text-body text-ink-2">{post.excerpt}</p>}
      </div>
    </article>
  )
}
