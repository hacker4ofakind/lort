"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useUser, type User } from "@/lib/auth"
import { errorMessage } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"

/**
 * Name, avatar and sign out. The notification switches (It shipped, Changelog, Replies from the
 * team) join in Phase 3 and only when email is on.
 */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useUser()
  if (!user) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>This is how you appear next to your ideas and comments.</DialogDescription>
        </DialogHeader>
        {/* The popup unmounts when closed, so the form starts fresh each time it opens. */}
        <ProfileForm user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ProfileForm({ user, onDone }: { user: User; onDone: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(user.name)
  const [avatar, setAvatar] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      setError("Pick a name people will see next to your ideas.")
      return
    }
    setPending(true)
    setError("")
    try {
      // The SDK refreshes the saved session when you update your own record.
      await pb.collection("users").update(user.id, avatar ? { name: name.trim(), avatar } : { name: name.trim() })
      await qc.invalidateQueries()
      toast("Saved your profile.")
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="flex items-center gap-4">
        <PersonAvatar person={{ id: user.id, name: name || user.name, avatar: user.avatar }} size={56} keyline />
        <Field className="flex-1">
          <FieldLabel htmlFor="profile-avatar">Picture</FieldLabel>
          <Input
            id="profile-avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="h-10 pt-1.5"
            onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
          />
        </Field>
      </div>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="profile-name">Name</FieldLabel>
        <Input id="profile-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <FieldError>{error}</FieldError>
      </Field>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            pb.authStore.clear()
            await qc.invalidateQueries()
            onDone()
          }}
        >
          Sign out
        </Button>
        <span className="flex-1" />
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}
