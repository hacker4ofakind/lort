"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"

/** Where the team's "Copy password reset link" points. Works without email. */
export default function ResetPasswordPage() {
  return (
    <main className="flex justify-center px-4 py-10">
      <Suspense>
        <ResetPassword />
      </Suspense>
    </main>
  )
}

function ResetPassword() {
  const token = useSearchParams().get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (password.length < 8) return setError("Use at least 8 characters.")
    if (password !== confirm) return setError("The two passwords don't match.")
    setPending(true)
    setError("")
    try {
      await pb.collection("users").confirmPasswordReset(token, password, confirm)
      setDone(true)
    } catch (err) {
      setError(errorMessage(err, "That link has expired. Ask the team for a new one."))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex w-[420px] max-w-full flex-col gap-[18px] rounded-xl border bg-card px-[30px] pt-8 pb-7">
      <div>
        <h1 className="font-display text-[26px] leading-[31px] font-bold tracking-[-0.01em]">
          {done ? "You're all set" : "Choose a new password"}
        </h1>
        <p className="mt-2 text-body text-ink-2">
          {done ? "Sign in with your new password from the top bar." : "Pick something you'll remember."}
        </p>
      </div>
      {done ? (
        <Button render={<Link href="/feedback" />} variant="secondary" className="w-full">
          Back to the board
        </Button>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-[18px]"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <FieldGroup className="gap-[18px]">
            <Field>
              <FieldLabel htmlFor="reset-password">New password</FieldLabel>
              <Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="reset-confirm">Type it again</FieldLabel>
              <Input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <FieldError>{error}</FieldError>
            </Field>
          </FieldGroup>
          <Button type="submit" className="w-full" disabled={pending || !token} aria-busy={pending}>
            Save password
          </Button>
        </form>
      )}
    </section>
  )
}
