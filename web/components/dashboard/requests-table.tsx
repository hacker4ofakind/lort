"use client"

import Link from "next/link"
import { IconArrowUp } from "@tabler/icons-react"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { StatusIcon } from "@/components/lort/status-icon"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { RequestItem } from "@/lib/api"
import { STATUS_META } from "@/lib/status"
import { shortDate } from "@/lib/time"
import { cn } from "@/lib/utils"

export interface RequestsTableProps {
  items: RequestItem[]
  /** The table's filters as a query string, carried to the request page for Skip and "3 of 12". */
  search: string
  /** Ids that just arrived over realtime. */
  fresh: string[]
}

/** The dashboard's requests: status icon, title (New, Hidden), votes, tags, date, requested by. Rows open the request. */
export function RequestsTable({ items, search, fresh }: RequestsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[46px]">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead>Request</TableHead>
            <TableHead className="w-[78px] text-right">Votes</TableHead>
            <TableHead className="w-[214px] max-lg:hidden">Tags</TableHead>
            <TableHead className="w-[78px] max-sm:hidden">Date</TableHead>
            <TableHead className="w-[62px]">
              <span className="sr-only">Requested by</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow
              key={r.id}
              className={cn(
                "relative",
                r.new && "bg-primary-soft [--si-ground:var(--primary-soft)] hover:bg-primary-soft",
                fresh.includes(r.id) && "animate-fresh"
              )}
            >
              <TableCell>
                <Tooltip>
                  <TooltipTrigger render={<span className="relative z-10 inline-flex" />}>
                    <StatusIcon status={r.status} size={18} />
                  </TooltipTrigger>
                  <TooltipContent>{STATUS_META[r.status].label}</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="max-w-0">
                <div className="flex min-w-0 items-center">
                  <Link
                    href={`/dashboard/requests/${r.id}${search}`}
                    className="truncate text-[15px] font-semibold outline-none after:absolute after:inset-0 focus-visible:after:outline-3 focus-visible:after:-outline-offset-3 focus-visible:after:outline-focus"
                  >
                    {r.title}
                  </Link>
                  {r.new && <Badge className="ml-2">New</Badge>}
                  {!r.visible && (
                    <Badge variant="secondary" className="ml-2">
                      Hidden
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span className="inline-flex items-center justify-end gap-1 text-label font-bold tabular-nums">
                  <IconArrowUp className="size-3.5" stroke={2.6} aria-hidden />
                  {r.votes}
                </span>
              </TableCell>
              <TableCell className="max-lg:hidden">
                <div className="flex gap-1.5 overflow-hidden">
                  {r.tags.slice(0, 2).map((t) => (
                    <span key={t.id} className="rounded-full bg-surface-2 px-[9px] py-0.5 text-[12px] font-semibold text-ink-2">
                      {t.name}
                    </span>
                  ))}
                  {r.tags.length > 2 && <span className="text-[12px] font-semibold text-muted-foreground">+{r.tags.length - 2}</span>}
                </div>
              </TableCell>
              <TableCell className="text-caption font-normal text-muted-foreground tabular-nums max-sm:hidden">
                {shortDate(r.created)}
              </TableCell>
              <TableCell>
                <PersonAvatar person={r.author} size={26} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
