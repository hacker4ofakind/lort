"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { IconGitMerge } from "@tabler/icons-react"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { VoteSticker } from "@/components/lort/vote-sticker"
import type { ComposerValue } from "@/components/lort/composer"
import { RequestImages } from "@/components/request/request-images"
import { Timeline } from "@/components/request/timeline"
import { Separator } from "@/components/ui/separator"
import type { Comment, Person, RequestDetail } from "@/lib/api"
import { relativeTime } from "@/lib/time"

export interface RequestViewProps {
  request: RequestDetail
  /** The dashboard's view: no "Stick a dot" caption and no comment count heading, team wording in the timeline. */
  team?: boolean
  onVote: () => void
  /** The chips row: read-only on the public page, editable in the dashboard. */
  chips: ReactNode
  /** Next to the sticker, e.g. the dashboard's Edit/Delete menu. */
  titleAside?: ReactNode
  /** The composer, or the "sign in to comment" card. */
  composer: ReactNode
  /** File token for protected images (needsFileToken, useFileToken). */
  token?: string
  renderAvatar?: (person: Person, avatar: ReactNode) => ReactNode
  canReply: boolean
  onReply: (parentId: string, value: ComposerValue) => Promise<void>
  canDelete: (c: Comment) => boolean
  onDelete: (c: Comment) => Promise<void>
}

/** One request: title, author, sticker, body, images, chips, composer and timeline. Shared by /feedback/[id] and the dashboard. */
export function RequestView(p: RequestViewProps) {
  const r = p.request
  const voteable = r.status !== "closed" && !r.mergedInto
  const author = <PersonAvatar person={r.author} size={32} keyline />
  return (
    <article>
      {r.mergedInto && (
        <div className="mb-5 flex items-center gap-2.5 rounded-md bg-surface-2 px-4 py-3 text-label font-normal text-ink-2">
          <IconGitMerge className="size-4 shrink-0" aria-hidden />
          <span>
            Merged into{" "}
            <Link
              href={p.team ? `/dashboard/requests/${r.mergedInto.id}` : `/feedback/${r.mergedInto.id}`}
              className="font-bold text-foreground underline-offset-4 hover:underline"
            >
              {r.mergedInto.name}
            </Link>
            . Its votes went there too.
          </span>
        </div>
      )}
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] leading-8 font-extrabold tracking-[-0.025em] text-balance sm:text-display-l">{r.title}</h1>
          <div className="mt-3.5 flex items-center gap-2.5 text-label font-normal">
            {p.renderAvatar ? p.renderAvatar(r.author, author) : author}
            <b className="font-bold">{r.author.name || "Someone"}</b>
            <span className="text-muted-foreground">· {relativeTime(r.created)}</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 pt-1">
          <VoteSticker count={r.votes} voted={r.voted} readOnly={!voteable} subject={r.title} onToggle={p.onVote} />
          {!p.team && voteable && <span className="text-[12px] font-semibold text-muted-foreground">Stick a dot</span>}
        </div>
        {p.titleAside}
      </div>

      {r.body && <p className="mt-5 max-w-[68ch] text-body whitespace-pre-wrap text-ink-2">{r.body}</p>}
      <RequestImages collection="requests" recordId={r.id} images={r.images} token={p.token} about={r.title} />

      <div className="mt-5 flex flex-wrap items-center gap-2">{p.chips}</div>

      <Separator className="mt-7 mb-6" />

      {!p.team && <h2 className="mb-3.5 font-display text-title">{r.comments === 1 ? "1 comment" : `${r.comments} comments`}</h2>}
      {p.composer}

      <Timeline
        request={r}
        team={p.team}
        token={p.token}
        renderAvatar={p.renderAvatar}
        canReply={p.canReply}
        onReply={p.onReply}
        canDelete={p.canDelete}
        onDelete={p.onDelete}
      />
    </article>
  )
}
