"use client"

import { useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { resetLink, setBanned, userSummary, type Person } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * Wraps a person's avatar in the dashboard: a popover with their email, join date, request and
 * vote counts and verification, plus Copy password reset link (works without email) and Ban.
 */
export function PersonPopover({ person, children }: { person: Person; children: ReactNode }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const summary = useQuery({
    queryKey: keys.user(person.id),
    queryFn: () => userSummary(pbAdmin, person.id),
    enabled: open && !!person.id,
  })
  if (!person.id) return <>{children}</>
  const s = summary.data
  const joined = s ? new Date(s.joined) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<button type="button" className="rounded-full" aria-label={`${person.name || "Someone"}, open member menu`} />}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[270px]">
        <div className="flex items-center gap-2.5 px-1 pb-2.5">
          <PersonAvatar person={person} size={36} />
          <div className="min-w-0 text-[12px] text-muted-foreground">
            <div className="text-label font-bold text-foreground">{person.name || "Someone"}</div>
            {s ? (
              <>
                <div className="truncate">
                  {s.email} · joined {MONTHS[joined!.getMonth()]} {joined!.getFullYear()}
                </div>
                <div>
                  {s.requests} {s.requests === 1 ? "request" : "requests"} · {s.votes} {s.votes === 1 ? "vote" : "votes"} ·{" "}
                  {s.verified ? "verified email" : "email not verified"}
                </div>
              </>
            ) : (
              <div>Loading…</div>
            )}
          </div>
        </div>
        <Separator />
        <div className="flex flex-col pt-1.5">
          <Button
            variant="neutral"
            className="justify-start rounded-xl px-2.5"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(await resetLink(pbAdmin, person.id))
                toast("Copied the reset link. Send it to them; it works for 30 minutes.")
              } catch (err) {
                toast(errorMessage(err))
              }
            }}
          >
            Copy password reset link
          </Button>
          {s && !s.team && (
            <Button
              variant="destructive"
              className="justify-start rounded-xl px-2.5"
              onClick={async () => {
                try {
                  await setBanned(pbAdmin, person.id, !s.banned)
                  await qc.invalidateQueries({ queryKey: keys.user(person.id) })
                  toast(s.banned ? `Unbanned ${person.name}.` : `Banned ${person.name}. They can read but not post, vote or comment.`)
                } catch (err) {
                  toast(errorMessage(err))
                }
              }}
            >
              {s.banned ? `Unban ${person.name}` : `Ban ${person.name}`}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
