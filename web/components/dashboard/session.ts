"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { teamMe } from "@/lib/api"
import { isAuthError } from "@/lib/errors"
import { pb, pbAdmin } from "@/lib/pocketbase"
import type { RecordModel } from "pocketbase"

/**
 * What a failed /api/lort/team/me means for the admin's session. Only a 401 or 403 (the server
 * no longer accepts the token) ends it; an aborted request (status 0, e.g. the admin navigated
 * away mid-fetch) or a network blip keeps it. Pure, for tests.
 */
export function sessionAfterError(err: unknown): "sign-out" | "keep" {
  return isAuthError(err) ? "sign-out" : "keep"
}

/** Signs the admin out of the dashboard and of their board profile. */
export function signOutAdmin() {
  pbAdmin.authStore.clear()
  pb.authStore.clear()
}

/**
 * Links the admin's board profile into pb: from now on they comment, vote and suggest as it.
 * The answer only counts for the admin session that asked: if they signed out (or someone else
 * signed in) while it was on its way, it's dropped.
 */
export async function linkProfile() {
  const session = pbAdmin.authStore.token
  const me = await teamMe(pbAdmin)
  if (!session || pbAdmin.authStore.token !== session) return
  pb.authStore.save(me.token, me.profile as RecordModel)
}

/**
 * Renews the board profile for the current admin session. A 401/403 signs out that session only:
 * a late rejection mustn't end a newer one. Network errors and aborts keep it.
 */
export async function renewSession(): Promise<"linked" | "signed-out" | "kept"> {
  const session = pbAdmin.authStore.token
  try {
    await linkProfile()
    return "linked"
  } catch (err) {
    if (sessionAfterError(err) === "sign-out" && session && pbAdmin.authStore.token === session) {
      signOutAdmin()
      return "signed-out"
    }
    return "kept"
  }
}

/**
 * The dashboard's guard. Without a superuser session it sends the admin to the sign-in page.
 * With one, it renews the board-profile token once per load, signing out only on 401/403.
 * The shell renders straight away (the session lives in localStorage, which the server can't
 * see, so branching on it during render would break hydration); pages show their skeletons
 * until their data arrives.
 */
export function useAdminSession() {
  const router = useRouter()
  const pathname = usePathname()
  const qc = useQueryClient()

  useEffect(() => {
    if (!pbAdmin.authStore.isValid) {
      router.replace(`/dashboard/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    let cancelled = false
    void renewSession().then((outcome) => {
      if (outcome === "linked") void qc.invalidateQueries()
      else if (outcome === "signed-out" && !cancelled) router.replace(`/dashboard/login?next=${encodeURIComponent(pathname)}`)
    })
    return () => {
      cancelled = true
    }
    // Once per dashboard load, not per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
