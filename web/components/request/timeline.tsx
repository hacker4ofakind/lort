"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { IconArrowsExchange, IconGitMerge } from "@tabler/icons-react"
import { InternalNote } from "@/components/lort/internal-note"
import { Composer, type ComposerValue } from "@/components/lort/composer"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { StatusIcon } from "@/components/lort/status-icon"
import { RequestImages } from "@/components/request/request-images"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Comment, Person, RequestDetail, TimelineEvent } from "@/lib/api"
import { STATUS_META, isStatus } from "@/lib/status"
import { relativeTime, shortDate } from "@/lib/time"
import { buildTimeline } from "@/lib/timeline"
import { cn } from "@/lib/utils"

export interface TimelineProps {
  request: RequestDetail
  /** The dashboard's wording ("Luk moved this…") instead of the public "Luk from the team moved this…". */
  team?: boolean
  /** File token for protected images (needsFileToken). */
  token?: string
  /** Wraps an avatar, e.g. in the dashboard's person popover. */
  renderAvatar?: (person: Person, avatar: ReactNode) => ReactNode
  /** Signed in and not banned: shows Reply. */
  canReply: boolean
  onReply: (parentId: string, value: ComposerValue) => Promise<void>
  canDelete: (c: Comment) => boolean
  onDelete: (c: Comment) => Promise<void>
}

/** Status changes, merges and comments, newest first; replies sit under their comment. */
export function Timeline(p: TimelineProps) {
  const entries = buildTimeline(p.request)
  return (
    <section aria-label="Activity" className="mt-7 flex flex-col gap-5">
      {entries.map((e) =>
        e.type === "event" ? (
          <EventRow key={e.event.id} event={e.event} request={p.request} team={p.team} />
        ) : (
          <CommentItem key={e.comment.id} comment={e.comment} {...p} />
        )
      )}
    </section>
  )
}

function Who({ person, team }: { person: Person; team?: boolean }) {
  return (
    <>
      <b className="font-bold text-foreground">{person.name || "Someone"}</b>
      {!team && person.team && " from the team"}
    </>
  )
}

function EventRow({ event: ev, request, team }: { event: TimelineEvent; request: RequestDetail; team?: boolean }) {
  const when = ev.kind === "created" ? shortDate(ev.created) : relativeTime(ev.created)
  let icon: ReactNode = <StatusIcon status="pending" keyline size={20} decorative />
  let text: ReactNode
  const refLink = (fallback: string) =>
    ev.ref ? (
      <Link href={team ? `/dashboard/requests/${ev.ref.id}` : `/feedback/${ev.ref.id}`} className="font-bold text-foreground underline-offset-4 hover:underline">
        {ev.ref.name}
      </Link>
    ) : (
      fallback
    )
  const roundIcon = (node: ReactNode) => (
    <span aria-hidden className="grid size-5 place-items-center rounded-full bg-surface-2 text-ink-2">
      {node}
    </span>
  )
  switch (ev.kind) {
    case "created":
      text = (
        <>
          <Who person={ev.actor} /> posted this in {request.board.name}
        </>
      )
      break
    case "status_changed":
      if (isStatus(ev.to)) icon = <StatusIcon status={ev.to} keyline size={20} decorative />
      text = (
        <>
          <Who person={ev.actor} team={team} /> moved this to{" "}
          <b className="font-bold text-foreground">{isStatus(ev.to) ? STATUS_META[ev.to].label : ev.to}</b>
        </>
      )
      break
    case "merged_in":
      icon = roundIcon(<IconGitMerge className="size-3" />)
      text = (
        <>
          <Who person={ev.actor} team={team} /> merged this into {refLink("another request")}
        </>
      )
      break
    case "merged_from":
      icon = roundIcon(<IconGitMerge className="size-3" />)
      text = (
        <>
          <Who person={ev.actor} team={team} /> merged {refLink("a duplicate")} into this
        </>
      )
      break
    case "board_changed":
      icon = roundIcon(<IconArrowsExchange className="size-3" />)
      text = (
        <>
          <Who person={ev.actor} team={team} /> moved this from {ev.from || "another board"} to {ev.to}
        </>
      )
      break
  }
  return (
    <div className="flex items-center gap-3 pl-1 text-label font-normal text-muted-foreground">
      {icon}
      <span>
        {text} · {when}
      </span>
    </div>
  )
}

function CommentItem({ comment: c, ...p }: TimelineProps & { comment: Comment }) {
  const [replying, setReplying] = useState(false)
  if (c.internal) {
    return (
      <InternalNote
        author={c.author.name || "Someone"}
        time={relativeTime(c.created)}
        actions={p.canDelete(c) && <DeleteComment onDelete={() => p.onDelete(c)} />}
      >
        {c.body}
        <RequestImages collection="comments" recordId={c.id} images={c.images} token={p.token} about={p.request.title} />
      </InternalNote>
    )
  }
  return (
    <div className="px-1">
      <CommentBody comment={c} {...p} />
      <div className="mt-1 ml-[34px] flex gap-3">
        {p.canReply && (
          <Button variant="link" className="text-caption font-semibold text-muted-foreground" onClick={() => setReplying(true)}>
            Reply
          </Button>
        )}
      </div>
      {c.replies.map((r) => (
        <div key={r.id} className="mt-3 ml-[34px] rounded-md bg-card px-4 py-3.5">
          <CommentBody comment={r} {...p} />
        </div>
      ))}
      {replying && (
        <div className="mt-3 ml-[34px]">
          <Composer
            autoFocus
            label={`Reply to ${c.author.name || "this comment"}`}
            placeholder={`Reply to ${c.author.name || "this comment"}…`}
            onSubmit={async (v) => {
              await p.onReply(c.id, v)
              setReplying(false)
            }}
          />
          <Button variant="link" className="mt-1 text-caption text-muted-foreground" onClick={() => setReplying(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}

function CommentBody({ comment: c, ...p }: TimelineProps & { comment: Comment }) {
  const avatar = <PersonAvatar person={c.author} size={26} />
  return (
    <>
      <div className="flex items-center gap-2 text-label font-normal">
        {p.renderAvatar ? p.renderAvatar(c.author, avatar) : avatar}
        <b className="font-bold">{c.author.name || "Someone"}</b>
        {c.author.team && <Badge>Team</Badge>}
        <span className="text-muted-foreground">· {relativeTime(c.created)}</span>
        {p.canDelete(c) && (
          <span className="ml-auto">
            <DeleteComment onDelete={() => p.onDelete(c)} />
          </span>
        )}
      </div>
      <p className={cn("mt-1.5 ml-[34px] text-body whitespace-pre-wrap text-ink-2")}>{c.body}</p>
      <div className="ml-[34px]">
        <RequestImages collection="comments" recordId={c.id} images={c.images} token={p.token} about={p.request.title} />
      </div>
    </>
  )
}

function DeleteComment({ onDelete }: { onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="link" className="text-caption font-semibold text-muted-foreground" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
          <AlertDialogDescription>It disappears for everyone, along with its replies.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          {/* AlertDialogAction doesn't close the dialog by itself; close it once the delete is done. */}
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                await onDelete()
                setOpen(false)
              } finally {
                setPending(false)
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
