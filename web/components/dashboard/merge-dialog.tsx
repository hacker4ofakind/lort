"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { StatusIcon } from "@/components/lort/status-icon"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listRequests, merge, type RequestDetail, type RequestItem } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { useDebounced } from "@/lib/use-debounced"

/**
 * Merge: pick the request this one duplicates (search by title), then confirm. The source closes,
 * points at the target, and its voters' dots move there.
 */
export function MergeDialog({ request: r, open, onOpenChange }: { request: RequestDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <MergeForm request={r} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function MergeForm({ request: r, onDone }: { request: RequestDetail; onDone: () => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [target, setTarget] = useState<RequestItem | null>(null)
  const [pending, setPending] = useState(false)
  const search = useDebounced(q.trim(), 250)
  const params = { q: search, sort: "top", status: "pending,reviewing,planned,progress,completed" }
  const results = useQuery({
    queryKey: keys.requests("team", { ...params, merge: r.id }),
    queryFn: () => listRequests(pbAdmin, params),
  })
  const options = (results.data?.items ?? []).filter((x) => x.id !== r.id)

  if (target) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Merge into “{target.title}”?</DialogTitle>
          <DialogDescription>
            “{r.title}” closes and points there. Everyone who voted on it gets a dot on “{target.title}”.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setTarget(null)}>
            Pick another
          </Button>
          <Button
            disabled={pending}
            aria-busy={pending}
            onClick={async () => {
              setPending(true)
              try {
                await merge(pbAdmin, r.id, target.id)
                await Promise.all([
                  qc.invalidateQueries({ queryKey: ["request"] }),
                  qc.invalidateQueries({ queryKey: ["requests"] }),
                  qc.invalidateQueries({ queryKey: keys.stats }),
                ])
                toast(`Merged into “${target.title}”.`)
                onDone()
                router.push(`/dashboard/requests/${target.id}`)
              } catch (err) {
                toast(errorMessage(err))
                setPending(false)
              }
            }}
          >
            Merge
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Merge into…</DialogTitle>
        <DialogDescription>Find the request this one duplicates.</DialogDescription>
      </DialogHeader>
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search by title" value={q} onValueChange={setQ} />
        <CommandList className="mt-2 max-h-72">
          <CommandEmpty>{results.isPending ? "Searching…" : "Nothing matches."}</CommandEmpty>
          {options.map((o) => (
            <CommandItem key={o.id} value={o.id} onSelect={() => setTarget(o)}>
              <StatusIcon status={o.status} />
              <span className="truncate">{o.title}</span>
              <span className="ml-auto text-caption text-muted-foreground tabular-nums">{o.votes}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </>
  )
}
