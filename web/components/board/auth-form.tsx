"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useConfig } from "@/app/providers"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"

export type AuthMode = "signup" | "signin"

export interface AuthErrors {
  email?: string
  password?: string
}

/** Inline validation, on blur and on submit. Pure, for tests. */
export function validateAuth(email: string, password: string, mode: AuthMode): AuthErrors {
  const errors: AuthErrors = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter an email address like name@example.com."
  if (mode === "signup" && password.length < 8) errors.password = "Use at least 8 characters."
  if (mode === "signin" && !password) errors.password = "Enter your password."
  return errors
}

export interface AuthFormProps {
  /** Called once signed in. */
  onDone: () => void
  initialMode?: AuthMode
  /** Replaces the default heading, e.g. inside the Suggest modal. */
  heading?: string
}

/**
 * Sign up (email and password only; the name defaults to the part before the @) or sign in.
 * When email is on (Phase 3) a "Check your inbox" step follows sign-up; in 1B it doesn't exist.
 */
export function AuthForm({ onDone, initialMode = "signup", heading }: AuthFormProps) {
  const config = useConfig()
  const qc = useQueryClient()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [website, setWebsite] = useState("") // honeypot: people never see it, bots fill it
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState("")
  const [pending, setPending] = useState(false)

  const errors = validateAuth(email, password, mode)
  const show = (f: keyof AuthErrors) => (submitted || touched[f] ? errors[f] : undefined)
  const signup = mode === "signup"

  const submit = async () => {
    setSubmitted(true)
    setServerError("")
    if (errors.email || errors.password) return
    setPending(true)
    try {
      const users = pb.collection("users")
      if (signup) await users.create({ email: email.trim(), password, passwordConfirm: password, website })
      await users.authWithPassword(email.trim(), password)
      // Votes and what's visible depend on who is signed in.
      await qc.invalidateQueries()
      onDone()
    } catch (err) {
      setServerError(
        errorMessage(err, signup ? "We couldn't create that account. Try again." : "That email and password don't match.")
      )
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
      <div>
        <h2 className="font-display text-[26px] leading-[31px] font-bold tracking-[-0.01em]">
          {heading ?? (signup ? `Join the ${config.appName} board` : "Welcome back")}
        </h2>
        <p className="mt-2 text-body text-ink-2">
          {signup
            ? `Suggest ideas and stick dots on the ones you want${config.features.email ? `, and hear when ${config.appName} adds them` : ""}.`
            : "Sign in to suggest ideas and vote."}
        </p>
      </div>
      <FieldGroup className="gap-[18px]">
        <Field data-invalid={!!show("email")}>
          <FieldLabel htmlFor="auth-email">Email</FieldLabel>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            aria-invalid={!!show("email")}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          />
          <FieldError>{show("email")}</FieldError>
        </Field>
        <Field data-invalid={!!show("password")}>
          <FieldLabel htmlFor="auth-password">Password</FieldLabel>
          <Input
            id="auth-password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            aria-invalid={!!show("password")}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          />
          {show("password") ? (
            <FieldError>{show("password")}</FieldError>
          ) : (
            signup && <p className="ml-[18px] text-caption text-muted-foreground">At least 8 characters.</p>
          )}
        </Field>
      </FieldGroup>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] size-px opacity-0"
      />
      {serverError && (
        <p role="alert" className="text-caption font-medium text-danger">
          {serverError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {signup ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-label font-normal text-muted-foreground">
        {signup ? "Already have one? " : "New here? "}
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setMode(signup ? "signin" : "signup")
            setSubmitted(false)
            setServerError("")
          }}
        >
          {signup ? "Sign in" : "Create an account"}
        </Button>
      </p>
    </form>
  )
}
