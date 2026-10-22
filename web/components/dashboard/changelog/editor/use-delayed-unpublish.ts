"use client"

import { useEffect, useRef, useState } from "react"
import { ClientResponseError } from "pocketbase"
import { toast } from "sonner"
import { undoToast } from "@/components/lort/undo-toast"
import { unpublishPost, type TeamPost } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"

export const UNPUBLISH_SECONDS = 10

interface Paused {
  pause(): void
  resume(): void
  discard(): void
}

export interface UnpublishHandlers {
  /** The server unpublished it (or someone else already had). */
  onDone(post: TeamPost | null): void
  /** Undo, or a failure: back to the live, read-only post. */
  onRestore(): void
}

/** Sends the unpublish even as the page goes away, with the admin's token. */
function unpublishKeepalive(id: string): Promise<unknown> {
  return fetch(`/api/lort/changelogs/${id}/unpublish`, {
    method: "POST",
    keepalive: true,
    headers: { Authorization: pbAdmin.authStore.token },
  }).catch(() => undefined)
}

/**
 * Unpublish with a 10-second Undo and no confirmation. The editor looks unpublished at once, but
 * the server is only called when the time is up; until then the post stays live and edits wait
 * (the save queue is paused, so they aren't refused as "This post is live"). Undo calls nothing
 * and drops those edits. Leaving early (unmount, closing the tab) sends it straight away.
 */
export function useDelayedUnpublish(post: { id: string; title: string }, autosave: Paused, handlers: UnpublishHandlers) {
  const [pending, setPending] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const toastId = useRef<string | number | undefined>(undefined)
  const latest = useRef({ post, autosave, handlers })
  useEffect(() => {
    latest.current = { post, autosave, handlers }
  })

  const commit = async () => {
    clearTimeout(timer.current)
    timer.current = undefined
    const { post, autosave, handlers } = latest.current
    try {
      const tp = await unpublishPost(pbAdmin, post.id)
      autosave.resume()
      setPending(false)
      handlers.onDone(tp)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 409) {
        // Someone else unpublished it meanwhile: that's what was asked for.
        autosave.resume()
        setPending(false)
        handlers.onDone(null)
        return
      }
      autosave.discard()
      autosave.resume()
      setPending(false)
      handlers.onRestore()
      toast(`Couldn't unpublish “${post.title}”. ${errorMessage(err)}`)
    }
  }

  const undo = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    const { autosave, handlers } = latest.current
    autosave.discard()
    autosave.resume()
    setPending(false)
    handlers.onRestore()
    toast("Still live.")
  }

  const unpublish = () => {
    if (timer.current) return
    latest.current.autosave.pause()
    setPending(true)
    timer.current = setTimeout(() => void commit(), UNPUBLISH_SECONDS * 1000)
    toastId.current = undoToast({ message: "Unpublished. It's a draft again.", seconds: UNPUBLISH_SECONDS, onUndo: undo })
  }

  // Leaving within the window commits it: the person meant it.
  useEffect(() => {
    const leave = () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      timer.current = undefined
      const { post, autosave } = latest.current
      toast.dismiss(toastId.current)
      void unpublishKeepalive(post.id).then(() => autosave.resume())
    }
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("pagehide", leave)
      leave()
    }
  }, [])

  return { unpublish, pending }
}
