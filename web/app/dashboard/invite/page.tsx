"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { getTokenPayload } from "pocketbase"
import { useConfig } from "@/app/providers"
import { AuthCard } from "@/components/dashboard/auth-card"
import { linkProfile } from "@/components/dashboard/session"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"

/** Where an invite link lands: the new admin picks a password and is signed straight in. */
export default function InvitePage() {
  const config = useConfig()
  return (
    <AuthCard title={`Join the ${config.appName} team`}>
      <Suspense>
        <InviteForm />
      </Suspense>
    </AuthCard>
  )
}

function InviteForm() {
  const router = useRouter()
  const qc = useQueryClient()
  const token = useSearchParams().get("token") ?? ""
  // The invite is a superuser password-reset token; its payload names the email.
  const email = String(getTokenPayload(token).email ?? "")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (password.length < 8) return setError("Use at least 8 characters.")
    if (password !== confirm) return setError("The two passwords don't match.")
    setPending(true)
    setError("")
    try {
      await pbAdmin.collection("_superusers").confirmPasswordReset(token, password, confirm)
      await pbAdmin.collection("_superusers").authWithPassword(email, password)
      await linkProfile()
      await qc.invalidateQueries()
      router.replace("/dashboard/requests")
    } catch (err) {
      setError(errorMessage(err, "That invite has expired. Ask for a new one."))
    } finally {
      setPending(false)
    }
  }

  if (!token || !email) {
    return <p className="text-center text-body text-ink-2">This invite link is incomplete. Ask whoever sent it for a new one.</p>
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="text-center text-label font-normal text-ink-2">
        You&apos;re joining as <b className="font-bold text-foreground">{email}</b>.
      </p>
      <FieldGroup className="gap-[18px]">
        <Field>
          <FieldLabel htmlFor="invite-password">Choose a password</FieldLabel>
          <Input id="invite-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="invite-confirm">Type it again</FieldLabel>
          <Input id="invite-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        Join the team
      </Button>
    </form>
  )
}
