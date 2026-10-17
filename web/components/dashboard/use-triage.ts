"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useConfig } from "@/app/providers"
import { undoToast } from "@/components/lort/undo-toast"
import { setStatus, undoComplete, type StatusChange } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { STATUS_META, type TriageActionId } from "@/lib/status"

/** Seconds a completion can be undone; matches the server's UndoWindow. */
export const UNDO_SECONDS = 60

/** The toast for a status change: roadmap moves are named, a completion offers Undo. Pure, for tests. */
export function changeMessage(ch: StatusChange): string | null {
  if (ch.to === "completed") return "Marked as completed"
  if (ch.roadmap === "added") return "Added to the roadmap"
  if (ch.roadmap === "removed") return "Taken off the roadmap"
  return null
}

/** Applies status actions from the triage bar and the status chip, with the spec's toasts. */
export function useTriage(requestId: string) {
  const qc = useQueryClient()
  const config = useConfig()
  const [busy, setBusy] = useState<TriageActionId | null>(null)

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["request"] }),
      qc.invalidateQueries({ queryKey: ["requests"] }),
      qc.invalidateQueries({ queryKey: ["queue"] }),
      qc.invalidateQueries({ queryKey: keys.stats }),
    ])
  }

  const undo = async () => {
    try {
      const back = await undoComplete(pbAdmin, requestId)
      toast(`Moved back to ${STATUS_META[back.to].label}`)
    } catch (err) {
      toast(errorMessage(err))
    }
    await refresh()
  }

  const apply = async (action: TriageActionId) => {
    setBusy(action)
    try {
      const ch = await setStatus(pbAdmin, requestId, action)
      await refresh()
      const message = changeMessage(ch)
      if (ch.to === "completed") {
        // The shipped emails (Phase 3) wait out the same window; the count joins the message then.
        undoToast({ message: config.features.email ? `${message}. People will hear about it in a minute.` : message!, seconds: UNDO_SECONDS, onUndo: undo })
      } else if (message) {
        toast(message)
      }
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return { apply, busy }
}
