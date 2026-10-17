"use client"

import Link from "next/link"
import { IconMessageCircle } from "@tabler/icons-react"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { StatusLabel } from "@/components/lort/status-icon"
import { VoteSticker } from "@/components/lort/vote-sticker"
import type { RequestItem } from "@/lib/api"
import { cn } from "@/lib/utils"

export interface RequestCardProps {
  request: RequestItem
  onVote: (id: string) => void
  /** It just arrived over realtime: start tinted and fade. */
  fresh?: boolean
}

/** One request on /feedback: sticker left; title, two-line excerpt, meta row. The whole card opens the request. */
export function RequestCard({ request: r, onVote, fresh }: RequestCardProps) {
  const closed = r.status === "closed"
  return (
    <article
      className={cn(
        "group relative flex items-start gap-3.5 rounded-lg border bg-card p-4 transition-colors [--si-ground:var(--surface)] hover:bg-surface-2 hover:[--si-ground:var(--surface-2)] has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-focus sm:gap-[18px] sm:px-[22px] sm:py-5",
        fresh && "animate-fresh"
      )}
    >
      <VoteSticker
        count={r.votes}
        voted={r.voted}
        readOnly={closed}
        subject={r.title}
        onToggle={() => onVote(r.id)}
        className="relative z-10 max-sm:size-10 max-sm:text-sm"
      />
      <div className="min-w-0 flex-1">
        <h2 className="mt-0.5 font-display text-[17px] leading-[22px] font-bold tracking-[-0.01em] text-balance sm:text-title">
          <Link href={`/feedback/${r.id}`} className="outline-none after:absolute after:inset-0 after:rounded-[inherit]">
            {r.title}
          </Link>
        </h2>
        {r.body && <p className="mt-1.5 line-clamp-2 text-[14px] leading-[21px] text-ink-2 sm:text-body">{r.body}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted-foreground sm:gap-x-3.5">
          <StatusLabel status={r.status} size={18} keyline className="font-medium" />
          <span className="rounded-full bg-surface-2 px-2.5 py-[3px] group-hover:bg-surface-3">{r.board.name}</span>
          <span className="inline-flex items-center gap-1.5">
            <PersonAvatar person={r.author} size={20} />
            {r.author.name || "Someone"}
          </span>
          <span className="inline-flex items-center gap-1.5" aria-label={`${r.comments} comments`}>
            <IconMessageCircle className="size-[15px]" aria-hidden />
            {r.comments}
          </span>
          {r.awaitingApproval && <span>Waiting for approval</span>}
        </div>
      </div>
    </article>
  )
}
