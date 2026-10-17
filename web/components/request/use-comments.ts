"use client"

import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { ComposerValue } from "@/components/lort/composer"
import type { Comment } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pb, type Client } from "@/lib/pocketbase"

/**
 * Posting and deleting comments on one request. Posts always go through pb (the board user, or
 * an admin's team profile); `deleteWith` is pbAdmin in the dashboard, so the team can delete
 * anyone's comment. Both refresh the request page and the lists' comment counts.
 */
export function useComments(requestId: string, deleteWith: Client = pb) {
  const qc = useQueryClient()
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["request"] })
    await qc.invalidateQueries({ queryKey: ["requests"] })
  }
  return {
    post: async (v: ComposerValue, parent = "") => {
      // A plain object, so the SDK keeps `internal` a boolean in "@jsonPayload" when images are attached.
      await pb.collection("comments").create({
        request: requestId,
        parent,
        body: v.text,
        images: v.images,
        internal: v.visibility === "internal",
      })
      await refresh()
    },
    remove: async (c: Comment) => {
      try {
        await deleteWith.collection("comments").delete(c.id)
        toast("Deleted the comment.")
        await refresh()
      } catch (err) {
        toast(errorMessage(err))
      }
    },
  }
}
