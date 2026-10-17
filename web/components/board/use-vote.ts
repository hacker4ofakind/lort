"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useRequireUser } from "@/components/board/auth-gate"
import { getRequest, vote } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"
import { cachedRequest, patchRequest, toggledVote } from "@/lib/query"

/**
 * Toggles the signed-in user's vote with an optimistic update everywhere the request is cached,
 * rolled back with a toast if the server says no. A signed-out visitor signs in first; their
 * vote is then added (not toggled: they may already have voted from another device).
 */
export function useVote() {
  const qc = useQueryClient()
  const requireUser = useRequireUser()
  const mutation = useMutation({
    mutationFn: (id: string) => vote(pb, id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["requests"] })
      await qc.cancelQueries({ queryKey: ["request"] })
      // Only this request's vote is remembered: restoring whole cached lists on failure would
      // undo other votes that succeeded meanwhile.
      const before = cachedRequest(qc, id)
      patchRequest(qc, id, toggledVote)
      return { before: before && { voted: before.voted, votes: before.votes } }
    },
    onError: (err, id, ctx) => {
      if (ctx?.before) {
        const { voted, votes } = ctx.before
        patchRequest(qc, id, (r) => ({ ...r, voted, votes }))
      }
      toast(errorMessage(err, "Your vote didn't stick. Try again."))
    },
    onSuccess: (res, id) => patchRequest(qc, id, (r) => ({ ...r, voted: res.voted, votes: res.votes })),
  })

  return (id: string) => {
    if (pb.authStore.isValid) {
      mutation.mutate(id)
      return
    }
    requireUser(async () => {
      try {
        const d = await getRequest(pb, id)
        if (!d.voted) mutation.mutate(id)
      } catch (err) {
        toast(errorMessage(err))
      }
    })
  }
}
