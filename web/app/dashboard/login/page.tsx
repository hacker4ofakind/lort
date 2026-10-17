"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useConfig } from "@/app/providers"
import { AuthCard } from "@/components/dashboard/auth-card"
import { linkProfile, signOutAdmin } from "@/components/dashboard/session"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"

/** Superusers only. Board accounts can't sign in here. */
export default function LoginPage() {
  const config = useConfig()
  return (
    <AuthCard title={`${config.appName} dashboard`}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  )
}

function LoginForm() {
  const router = useRouter()
  const next = useSearchParams().get("next")
  const qc = useQueryClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password.")
    setPending(true)
    setError("")
    try {
      await pbAdmin.collection("_superusers").authWithPassword(email.trim(), password)
      await linkProfile()
      await qc.invalidateQueries()
      router.replace(next?.startsWith("/dashboard") ? next : "/dashboard/requests")
    } catch (err) {
      signOutAdmin()
      setError(errorMessage(err, "That email and password don't match a team account."))
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
        void submit()
      }}
    >
      <FieldGroup className="gap-[18px]">
        <Field>
          <FieldLabel htmlFor="login-email">Email</FieldLabel>
          <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="login-password">Password</FieldLabel>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        Sign in
      </Button>
      <p className="mt-0.5 text-center text-caption leading-[19px] font-normal text-muted-foreground">
        Forgot it? On the server, run
        <br />
        <code className="rounded-[6px] bg-surface-2 px-[7px] py-0.5 font-mono text-[12px] text-foreground">./setup.sh --reset-admin</code>
      </p>
    </form>
  )
}
