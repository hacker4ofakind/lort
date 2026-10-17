"use client"

import { useQuery } from "@tanstack/react-query"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

export interface Board {
  id: string
  name: string
  order: number
  isPublic: boolean
  requireApproval: boolean
}

export interface Tag {
  id: string
  name: string
  order: number
}

/** Every board, private ones too, in order (the team's view). */
export function useBoards() {
  return useQuery({
    queryKey: keys.boards,
    queryFn: () => pbAdmin.collection("boards").getFullList<Board>({ sort: "order,created" }),
  })
}

/** Every tag, in order. */
export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () => pbAdmin.collection("tags").getFullList<Tag>({ sort: "order,created" }),
  })
}
