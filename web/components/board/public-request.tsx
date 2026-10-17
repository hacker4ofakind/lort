"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ClientResponseError } from "pocketbase"
import { IconArrowLeft } from "@tabler/icons-react"
import { useConfig } from "@/app/providers"
import { useRequireUser } from "@/components/board/auth-gate"
import { useVote } from "@/components/board/use-vote"
import { Chip } from "@/components/lort/chip"
import { Composer } from "@/components/lort/composer"
import { StatusLabel } from "@/components/lort/status-icon"
import { useFileToken } from "@/components/request/request-images"
import { RequestSkeleton } from "@/components/request/request-skeleton"
import { RequestView } from "@/components/request/request-view"
import { useComments } from "@/components/request/use-comments"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { getRequest } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { pb } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

/** /feedback/[id]: the shared request view without the team's controls. */
export function PublicRequest({ id }: { id: string }) {
  const config = useConfig()
  const user = useUser()
  const requireUser = useRequireUser()
  const onVote = useVote()
  const comments = useComments(id)
  const q = useQuery({ queryKey: keys.request("board", id), queryFn: () => getRequest(pb, id) })
  const token = useFileToken(pb, !!q.data && !q.data.public)

  const back = (
    <Link href="/feedback" className="mb-[22px] inline-flex items-center gap-1.5 text-label text-muted-foreground hover:text-foreground">
      <IconArrowLeft className="size-4" aria-hidden />
      All ideas
    </Link>
  )

  if (q.isError) {
    const gone = q.error instanceof ClientResponseError && q.error.status === 404
    return (
      <main className="mx-auto max-w-[820px] px-4 pt-6 sm:px-8">
        {back}
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{gone ? "That idea isn't here" : "This page didn't load"}</EmptyTitle>
            <EmptyDescription>
              {gone ? "It may have been removed, or it's waiting for the team to approve it." : "Check your connection, then try again."}
            </EmptyDescription>
          </EmptyHeader>
          {!gone && (
            <Button variant="secondary" onClick={() => q.refetch()}>
              Try again
            </Button>
          )}
        </Empty>
      </main>
    )
  }

  const r = q.data
  const composer = user ? (
    <Composer
      placeholder={`Add a comment for ${r?.author.name || "them"} and the ${config.appName} team…`}
      onSubmit={(v) => comments.post(v)}
    />
  ) : (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-5 py-4">
      <p className="flex-1 text-body text-ink-2">Sign in to join the conversation.</p>
      <Button variant="secondary" onClick={() => requireUser()}>
        Sign in to comment
      </Button>
    </div>
  )

  return (
    <main className="mx-auto max-w-[820px] px-4 pt-6 sm:px-8">
      {back}
      {!r ? (
        <RequestSkeleton composer={composer} />
      ) : (
        <RequestView
          request={r}
          onVote={() => onVote(r.id)}
          token={token}
          chips={
            <>
              <Chip>
                <StatusLabel status={r.status} size={18} keyline />
              </Chip>
              <Chip>{r.board.name}</Chip>
              {r.tags.map((t) => (
                <Chip key={t.id} className="text-ink-2">
                  {t.name}
                </Chip>
              ))}
            </>
          }
          composer={composer}
          canReply={!!user}
          onReply={(parent, v) => comments.post(v, parent)}
          canDelete={(c) => !!user && c.author.id === user.id}
          onDelete={comments.remove}
        />
      )}
    </main>
  )
}
