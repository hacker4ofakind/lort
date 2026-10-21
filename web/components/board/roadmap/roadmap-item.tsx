import Link from "next/link"
import { VoteSticker } from "@/components/lort/vote-sticker"
import type { RequestItem, RoadmapStatus } from "@/lib/api"
import { whenText } from "@/lib/roadmap"

/** One card on the public roadmap: read-only sticker (showing the visitor's own vote), title, board, when. */
export function RoadmapItem({ item, column, now }: { item: RequestItem; column: RoadmapStatus; now?: Date }) {
  return (
    <article className="group relative flex items-start gap-3 rounded-lg border bg-card px-4 py-3.5 [--si-ground:var(--surface)] hover:bg-surface-2 has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-focus">
      <VoteSticker count={item.votes} voted={item.voted} size="sm" readOnly />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base leading-[21px] font-bold tracking-[-0.01em] text-balance">
          <Link href={`/feedback/${item.id}`} className="outline-none after:absolute after:inset-0 after:rounded-[inherit]">
            {item.title}
          </Link>
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-caption font-medium text-muted-foreground">
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 group-hover:bg-surface-3">{item.board.name}</span>
          <span>{whenText(item, column, now)}</span>
        </div>
      </div>
    </article>
  )
}
