"use client"

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { useRequireUser } from "@/components/board/auth-gate"
import { getRequest, vote } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"
import { patchRequest, toggledVote } from "@/lib/query"

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
      const snapshot: Array<[QueryKey, unknown]> = [
        ...qc.getQueriesData({ queryKey: ["requests"] }),
        ...qc.getQueriesData({ queryKey: ["request"] }),
      ]
      patchRequest(qc, id, toggledVote)
      return { snapshot }
    },
    onError: (err, _id, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
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
