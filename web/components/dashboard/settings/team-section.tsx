"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { SettingsSection } from "@/components/dashboard/settings/section"
import { Bone } from "@/components/lort/bone"
import { PersonAvatar } from "@/components/lort/person-avatar"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { invite, removeAdmin, teamList, type TeamMember } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { shortDate } from "@/lib/time"

/** Team: the admins, "Invite an admin" (a 7-day link to copy; emailed too once email is on) and Remove. */
export function TeamSection() {
  const team = useQuery({ queryKey: keys.team, queryFn: () => teamList(pbAdmin) })
  const [inviteOpen, setInviteOpen] = useState(false)
  const members = team.data?.items ?? []
  return (
    <SettingsSection id="team" title="Team" lede="Admins can sign in to this dashboard. Their comments show a Team badge.">
      {team.isPending
        ? [0, 1].map((i) => (
            <div key={i} className="flex items-center gap-4 border-t py-3.5 first:border-t-0">
              <Bone w={34} h={34} />
              <Bone w="40%" h={14} />
            </div>
          ))
        : members.map((m, i) => <MemberRow key={m.id} member={m} you={m.id === team.data?.you} founder={i === 0} />)}
      <div className="border-t pt-3">
        <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
          <IconPlus />
          Invite an admin
        </Button>
      </div>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <InviteForm onDone={() => setInviteOpen(false)} />
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}

function MemberRow({ member: m, you, founder }: { member: TeamMember; you: boolean; founder: boolean }) {
  const qc = useQueryClient()
  const name = m.name || m.email.split("@")[0]
  return (
    <div className="flex items-center gap-4 border-t py-3.5 first:border-t-0">
      <PersonAvatar person={{ id: "", name, team: true }} size={34} />
      <div className="min-w-0 flex-1">
        <b className="block text-[15px] font-semibold">
          {name}
          {you && (
            <Badge variant="secondary" className="ml-1.5">
              You
            </Badge>
          )}
        </b>
        <span className="block truncate text-caption font-normal text-muted-foreground">
          {m.email} · {founder ? "set up Lort" : `invited ${shortDate(m.created)}`}
        </span>
      </div>
      {!you && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(await invite(pbAdmin, m.email))
                toast("Copied a fresh invite link. It works for 7 days.")
              } catch (err) {
                toast(errorMessage(err))
              }
            }}
          >
            Copy invite link
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>Remove</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {name} from the team?</AlertDialogTitle>
                <AlertDialogDescription>They can&apos;t sign in to the dashboard any more. Their comments stay.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep them</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await removeAdmin(pbAdmin, m.id)
                      await qc.invalidateQueries({ queryKey: keys.team })
                      toast(`Removed ${name}.`)
                    } catch (err) {
                      toast(errorMessage(err))
                    }
                  }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState("")
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  if (link) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Send them this link</DialogTitle>
          <DialogDescription>It works for 7 days. They pick a password and land in the dashboard.</DialogDescription>
        </DialogHeader>
        <Input readOnly aria-label="Invite link" value={link} className="h-10 font-mono text-caption" onFocus={(e) => e.currentTarget.select()} />
        <DialogFooter>
          <Button variant="ghost" onClick={onDone}>
            Done
          </Button>
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(link)
              toast("Copied the invite link.")
            }}
          >
            Copy link
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter an email address like name@example.com.")
        setPending(true)
        setError("")
        try {
          setLink(await invite(pbAdmin, email.trim()))
          await qc.invalidateQueries({ queryKey: keys.team })
        } catch (err) {
          setError(errorMessage(err))
        } finally {
          setPending(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Invite an admin</DialogTitle>
        <DialogDescription>They&apos;ll be able to triage, reply and change settings.</DialogDescription>
      </DialogHeader>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="invite-email">Their email</FieldLabel>
        <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FieldError>{error}</FieldError>
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Create invite link
        </Button>
      </DialogFooter>
    </form>
  )
}
