import { LabelChips } from "@/components/board/changelog/label-chips"
import { Markdown } from "@/components/board/changelog/markdown"
import { ShareButton } from "@/components/board/changelog/share-button"
import { ShippedList } from "@/components/board/changelog/shipped-list"
import type { ChangelogLabel, RequestItem } from "@/lib/api"
import { longDate } from "@/lib/time"

export interface PostViewProps {
  title: string
  labels: ChangelogLabel[]
  /** When it went live; Preview leaves it out for a post that hasn't. */
  date?: string
  coverUrl?: string
  body: string
  shipped: RequestItem[]
  /** The address to share; Preview leaves it out. */
  share?: string
}

/** A post as the public sees it. The public page and the editor's Preview both draw it. */
export function PostView({ title, labels, date, coverUrl, body, shipped, share }: PostViewProps) {
  return (
    <article>
      {(date || labels.length > 0) && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          {date && <time dateTime={date} className="text-label font-bold">{longDate(date)}</time>}
          <LabelChips labels={labels} />
        </div>
      )}
      <h1 className="font-display text-display-l text-balance break-words sm:text-[44px] sm:leading-[48px]">{title}</h1>
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- PocketBase file, sized by its thumb
        <img src={coverUrl} alt="" className="mt-7 mb-[30px] h-auto w-full rounded-[18px] bg-surface-2" />
      )}
      <Markdown source={body} className={coverUrl ? "" : "mt-7"} />
      <ShippedList items={shipped} />
      {share && (
        <div className="mt-10 flex justify-center">
          <ShareButton slug={share} />
        </div>
      )}
    </article>
  )
}
