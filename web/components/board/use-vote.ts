"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useRequireUser } from "@/components/board/auth-gate"
import { getRequest, vote } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pb } from "@/lib/pocketbase"
import {
  patchRequest,
  restoreVotes,
  toggledVote,
  voteSnapshot,
} from "@/lib/query"

/** Requests whose vote is on its way to the server, shared by every sticker on the page. */
const voting = new Set<string>()

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
      // Only this request's vote fields are remembered, per cached copy (a list and the detail
      // page may hold different counts): restoring whole cached lists on failure would undo
      // other votes that succeeded meanwhile.
      const before = voteSnapshot(qc, id)
      patchRequest(qc, id, toggledVote)
      return { before }
    },
    onError: (err, id, ctx) => {
      if (ctx) restoreVotes(qc, id, ctx.before)
      toast(errorMessage(err, "Your vote didn't stick. Try again."))
    },
    onSuccess: (res, id) =>
      patchRequest(qc, id, (r) => ({
        ...r,
        voted: res.voted,
        votes: res.votes,
      })),
    onSettled: (_res, _err, id) => voting.delete(id),
  })

  // One vote per request at a time: a click while its vote is on the way does nothing, so a
  // late answer can never overwrite a newer one.
  const send = (id: string) => {
    if (voting.has(id)) return
    voting.add(id)
    mutation.mutate(id)
  }

  return (id: string) => {
    if (pb.authStore.isValid) {
      send(id)
      return
    }
    requireUser(async () => {
      try {
        const d = await getRequest(pb, id)
        if (!d.voted) send(id)
      } catch (err) {
        toast(errorMessage(err))
      }
    })
  }
}
