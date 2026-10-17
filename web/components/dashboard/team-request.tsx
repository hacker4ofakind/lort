"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ClientResponseError } from "pocketbase"
import { toast } from "sonner"
import { useVote } from "@/components/board/use-vote"
import { AdminChips } from "@/components/dashboard/admin-chips"
import { MergeDialog } from "@/components/dashboard/merge-dialog"
import { PersonPopover } from "@/components/dashboard/person-popover"
import { RequestMenu } from "@/components/dashboard/request-menu"
import { useTriage } from "@/components/dashboard/use-triage"
import { Bone } from "@/components/lort/bone"
import { Composer } from "@/components/lort/composer"
import { TriageBar } from "@/components/lort/triage-bar"
import { needsFileToken, useFileToken } from "@/components/request/request-images"
import { RequestSkeleton } from "@/components/request/request-skeleton"
import { RequestView } from "@/components/request/request-view"
import { useComments } from "@/components/request/use-comments"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { useSidebar } from "@/components/ui/sidebar"
import { getRequest, markSeen, queue } from "@/lib/api"
import { apiParams, parseTableFilters, tableSearch } from "@/lib/filters"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { OPEN_STATUSES, STATUS_META } from "@/lib/status"
import { cn } from "@/lib/utils"

/** "3 of 12 in Reviewing", "3 of 40 open", or "3 of 12" for any other filter. Pure, for tests. */
export function queueLabel(position: number, total: number, statuses: string[]): string {
  if (!position) return "Not in this list any more"
  const base = `${position} of ${total}`
  if (statuses.length === 1 && statuses[0] in STATUS_META) return `${base} in ${STATUS_META[statuses[0] as keyof typeof STATUS_META].label}`
  if (statuses.length === OPEN_STATUSES.length && OPEN_STATUSES.every((s) => statuses.includes(s))) return `${base} open`
  return base
}

/** /dashboard/requests/[id]: the shared request view with the team's controls and the triage bar. */
export function TeamRequest({ id }: { id: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { state } = useSidebar()
  const filters = parseTableFilters(useSearchParams())
  const params = apiParams(filters)
  const search = tableSearch(filters)
  const onVote = useVote()
  const comments = useComments(id, pbAdmin)
  const triage = useTriage(id)
  const [mergeOpen, setMergeOpen] = useState(false)

  const detail = useQuery({ queryKey: keys.request("team", id), queryFn: () => getRequest(pbAdmin, id) })
  const position = useQuery({ queryKey: keys.queue(params, id), queryFn: () => queue(pbAdmin, params, id) })
  const token = useFileToken(pbAdmin, !!detail.data && needsFileToken(detail.data))

  // Opening a request clears its "New" marker, once per visit.
  const seen = useRef("")
  const r = detail.data
  useEffect(() => {
    if (!r || !r.new || seen.current === r.id) return
    seen.current = r.id
    markSeen(pbAdmin, r.id)
      .then(() => Promise.all([qc.invalidateQueries({ queryKey: keys.stats }), qc.invalidateQueries({ queryKey: ["requests", "team"] })]))
      .catch(() => {})
  }, [r, qc])

  const skip = () => {
    const next = position.data?.next
    if (next) router.push(`/dashboard/requests/${next}${search}`)
    else toast("That's the end of this list.")
  }

  if (detail.isError) {
    const gone = detail.error instanceof ClientResponseError && detail.error.status === 404
    return (
      <main className="px-4 pt-6 sm:px-10 sm:pt-[30px]">
        <Empty className="mx-auto max-w-[820px]">
          <EmptyHeader>
            <EmptyTitle>{gone ? "That request is gone" : "This page didn't load"}</EmptyTitle>
            <EmptyDescription>
              <Link href={`/dashboard/requests${search}`}>Back to the requests</Link>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }

  const composer = (
    <Composer
      canUseInternal
      label="Comment"
      placeholder={r ? `Reply to ${r.author.name || "them"}, or leave a note for the team…` : "Write a reply or a note for the team…"}
      onSubmit={(v) => comments.post(v)}
    />
  )

  return (
    <main className="px-4 pt-6 pb-[170px] sm:px-10 sm:pt-[30px]">
      <div className="mx-auto max-w-[820px]">
        <nav aria-label="Breadcrumb" className="mb-[22px] flex items-center gap-2 text-label font-normal text-muted-foreground">
          <Link href={`/dashboard/requests${search}`} className="hover:text-foreground">
            Requests
          </Link>
          <span aria-hidden>/</span>
          {r ? <span>{r.board.name}</span> : <Bone w={48} h={12} />}
          <span className="flex-1" />
          {position.data ? (
            <span className="text-caption font-normal">{queueLabel(position.data.position, position.data.total, filters.status)}</span>
          ) : (
            <Bone w={120} h={12} />
          )}
        </nav>
        {!r ? (
          <RequestSkeleton composer={composer} />
        ) : (
          <RequestView
            request={r}
            team
            onVote={() => onVote(r.id)}
            token={token}
            titleAside={<RequestMenu request={r} />}
            chips={<AdminChips request={r} onStatusAction={triage.apply} />}
            renderAvatar={(person, avatar) => <PersonPopover person={person}>{avatar}</PersonPopover>}
            composer={composer}
            canReply
            onReply={(parent, v) => comments.post(v, parent)}
            canDelete={() => true}
            onDelete={comments.remove}
          />
        )}
      </div>

      {/* The triage bar floats at the bottom centre of the content area; a bone while its status is unknown. */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-7 z-20 flex justify-center px-4 md:left-(--sidebar-width)",
          state === "collapsed" && "md:left-(--sidebar-width-icon)"
        )}
      >
        <div className="pointer-events-auto">
          {r ? (
            <TriageBar
              status={r.status}
              busy={triage.busy}
              onAction={(a) => {
                if (a.id === "merge") setMergeOpen(true)
                else if (a.id === "skip") skip()
                else void triage.apply(a.id)
              }}
            />
          ) : (
            <Bone w={470} h={56} className="max-w-[calc(100vw-2rem)] inset-shadow-sm" />
          )}
        </div>
      </div>
      {r && <MergeDialog request={r} open={mergeOpen} onOpenChange={setMergeOpen} />}
    </main>
  )
}
