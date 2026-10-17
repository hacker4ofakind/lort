"use client"

// Reading the signed-in record from PocketBase in React.
//
// LocalAuthStore returns a new record object on every read, so handing authStore.record to
// useSyncExternalStore makes React see a change on every render and loop forever. The
// snapshot is the record as a JSON string instead (equal between reads), parsed with useMemo.
import { useMemo, useSyncExternalStore } from "react"
import { pb, pbAdmin, type Client } from "@/lib/pocketbase"

export interface User {
  id: string
  email: string
  name: string
  avatar: string
  verified: boolean
  isAdmin: boolean
  banned: boolean
}

export interface Admin {
  id: string
  email: string
}

function snapshot(c: Client): string {
  return c.authStore.isValid ? JSON.stringify(c.authStore.record) : "null"
}

const subscribers = new Map<Client, (cb: () => void) => () => void>()

function subscribe(c: Client) {
  let fn = subscribers.get(c)
  if (!fn) {
    fn = (cb) => c.authStore.onChange(() => cb())
    subscribers.set(c, fn)
  }
  return fn
}

export function useAuthRecord<T>(c: Client): T | null {
  const snap = useSyncExternalStore(subscribe(c), () => snapshot(c), () => "null")
  return useMemo(() => JSON.parse(snap) as T | null, [snap])
}

/** The signed-in board user, or null. */
export function useUser() {
  return useAuthRecord<User>(pb)
}

/** The signed-in dashboard admin (a superuser), or null. */
export function useAdmin() {
  return useAuthRecord<Admin>(pbAdmin)
}
