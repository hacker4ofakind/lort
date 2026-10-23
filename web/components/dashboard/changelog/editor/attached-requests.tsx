"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { IconArrowUp, IconPlus, IconX } from "@tabler/icons-react"
import { StatusIcon, StatusLabel } from "@/components/lort/status-icon"
import { VoteSticker } from "@/components/lort/vote-sticker"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { listRequests, type RequestItem } from "@/lib/api"
import { pbAdmin } from "@/lib/pocketbase"
import { STATUS_META } from "@/lib/status"
import { useDebounced } from "@/lib/use-debounced"

export const MAX_ATTACHED = 50
const PICKABLE = "pending,reviewing,planned,progress,completed,closed"

/** "Shipped in this update": the requests the post lists, with a search to attach more. */
export function AttachedRequests({
  items,
  editable,
  onChange,
}: {
  items: RequestItem[]
  editable: boolean
  onChange: (items: RequestItem[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const query = useDebounced(q, 300)
  const results = useQuery({
    queryKey: ["changelogs", "attach", query],
    queryFn: () => listRequests(pbAdmin, { q: query, status: PICKABLE, sort: "top" }),
    enabled: open,
  })
  const attached = new Set(items.map((r) => r.id))

  return (
    <section aria-labelledby="attached-heading" className="mt-10 border-t pt-[22px]">
      <div className="mb-3 flex items-center gap-3">
        <h2 id="attached-heading" className="flex-1 font-display text-[18px] leading-6 font-bold">
          Shipped in this update
        </h2>
        {editable && items.length < MAX_ATTACHED && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="secondary" size="sm" />}>
              <IconPlus />
              Attach a request
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(380px,calc(100vw-32px))] p-1.5">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search requests" aria-label="Search requests" value={q} onValueChange={setQ} />
                <CommandList label="Requests" className="mt-1.5 max-h-[300px]">
                  <CommandEmpty>{results.isPending ? "Searching…" : "No requests match."}</CommandEmpty>
                  {(results.data?.items ?? []).map((r) => (
                    <CommandItem
                      key={r.id}
                      value={r.id}
                      disabled={attached.has(r.id)}
                      onSelect={() => {
                        onChange([...items, r])
                        setOpen(false)
                        setQ("")
                      }}
                      className="gap-2.5"
                    >
                      {/* In a span, so the item's hover colour doesn't repaint the icon white. */}
                      <span className="inline-flex">
                        <StatusIcon status={r.status} size={14} decorative />
                      </span>
                      <span className="sr-only">{STATUS_META[r.status].label}:</span>
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      {attached.has(r.id) ? (
                        <span className="text-caption text-muted-foreground">Attached</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-caption font-bold tabular-nums text-muted-foreground">
                          <IconArrowUp className="size-3" aria-hidden />
                          {r.votes}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-body text-muted-foreground">Attach the requests this update ships. They&apos;ll be listed under the post.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 [--si-ground:var(--surface)]">
              <VoteSticker count={r.votes} voted={false} size="sm" readOnly subject={r.title} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[15px] font-bold">{r.title}</div>
                <div className="mt-1 text-caption">
                  <StatusLabel status={r.status} size={14} />
                </div>
              </div>
              {editable && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Detach ${r.title}`}
                  onClick={() => onChange(items.filter((x) => x.id !== r.id))}
                >
                  <IconX />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
