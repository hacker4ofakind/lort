"use client"

import { useMemo, useRef, useState } from "react"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ClientResponseError } from "pocketbase"
import { toast } from "sonner"
import { useConfig } from "@/app/providers"
import { completionToast } from "@/components/dashboard/use-triage"
import { moveOnRoadmap, undoComplete, type Roadmap, type RoadmapStatus } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { columnOf, isRoadmapStatus, moveCard, ROADMAP_ORDER } from "@/lib/roadmap"
import { STATUS_META } from "@/lib/status"

const MUTATION_KEY = ["roadmap-move"] as const
const FRESH_MS = 4000

/** A card the team moved: shown in its new column until the server's roadmap agrees. */
interface Move {
  from: RoadmapStatus
  to: RoadmapStatus
  at: Date
  /** The server answered; the move stays applied until the roadmap has been refetched. */
  settled: boolean
}

interface MoveVars {
  id: string
  title: string
  from: RoadmapStatus
  to: RoadmapStatus
  /** This move's toast. A new one for every move: Sonner keeps a dismissed id marked as removed. */
  toastId: string
}

/** The fetched roadmap with every move reapplied, so a refetch can never snap a card back. */
export function applyMoves(r: Roadmap, moves: Record<string, Move>): Roadmap {
  return Object.entries(moves).reduce((acc, [id, m]) => moveCard(acc, id, m.to, m.at), r)
}

export function columnOfCard(r: Roadmap, id: string): RoadmapStatus | undefined {
  return ROADMAP_ORDER.find((s) => r[s].some((i) => i.id === id))
}

const without = <T>(o: Record<string, T>, id: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== id))

/**
 * Everything the roadmap board does to a card: optimistic moves, the freeze while a card is in
 * the air, toasts and the Undo for a completion.
 *
 * - The board shows the fetched roadmap with every move reapplied (an overlay, not a cache
 *   write), so realtime refetches and other cards' moves can't undo it.
 * - While dragging, the board shows a snapshot taken at drag start: a refetch that reorders or
 *   removes the dragged card mid-drag would break dnd-kit.
 * - Drop → unfreeze and start the move in the same event, so the card never flashes back.
 * - One move per card at a time. The roadmap is refetched once the last move settles.
 */
export function useRoadmapMove(data: Roadmap | undefined) {
  const qc = useQueryClient()
  const config = useConfig()
  const [moves, setMoves] = useState<Record<string, Move>>({})
  const [frozen, setFrozen] = useState<Roadmap | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [instantDrop, setInstantDrop] = useState(false)
  const [fresh, setFresh] = useState<{ id: string; focus: boolean } | null>(null)
  const toastIds = useRef(new Map<string, string>()) // request id → its latest move's toast
  const moveCount = useRef(0)

  const live = useMemo(() => (data ? applyMoves(data, moves) : undefined), [data, moves])
  const view = frozen ?? live
  const busy = useMemo(
    () => new Set(Object.entries(moves).filter(([, m]) => !m.settled).map(([id]) => id)),
    [moves]
  )

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["requests"] }),
      qc.invalidateQueries({ queryKey: ["request"] }),
      qc.invalidateQueries({ queryKey: keys.stats }),
    ])

  const undo = async (v: MoveVars) => {
    setMoves((m) => without(m, v.id))
    try {
      const back = await undoComplete(pbAdmin, v.id)
      toast(`Moved back to ${STATUS_META[back.to].label}`)
    } catch (err) {
      toast(errorMessage(err))
    }
    await refresh()
  }

  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: (v: MoveVars) => moveOnRoadmap(pbAdmin, v.id, v.from, v.to),
    onSuccess: (ch, v) => {
      setMoves((m) => (m[v.id] ? { ...m, [v.id]: { ...m[v.id], settled: true } } : m))
      if (ch.from === ch.to) return
      if (ch.to === "completed") {
        completionToast({ id: v.toastId, title: v.title, change: ch, onUndo: () => void undo(v), email: config.features.email })
      } else if (isRoadmapStatus(ch.to)) {
        toast(`Moved to ${columnOf(ch.to).label}`, { id: v.toastId })
      }
    },
    onError: (err, v) => {
      // Only this card goes back; the others keep their pending moves.
      setMoves((m) => without(m, v.id))
      toast(`Couldn't move “${v.title}”. ${errorMessage(err)}`)
      if (err instanceof ClientResponseError && err.status === 409) void qc.invalidateQueries({ queryKey: ["requests"] })
    },
    onSettled: async () => {
      // Refetch once, when the last pending move is done (this one still counts as pending).
      if (qc.isMutating({ mutationKey: MUTATION_KEY }) !== 1) return
      await refresh()
      setMoves((m) => Object.fromEntries(Object.entries(m).filter(([, x]) => !x.settled)))
    },
  })

  const markFresh = (id: string, focus = false) => {
    setFresh({ id, focus })
    setTimeout(() => setFresh((f) => (f?.id === id ? null : f)), FRESH_MS)
  }

  /** Moves a card to a column: from a drop, or from a phone's "Move to…" menu. */
  const startMove = (id: string, to: RoadmapStatus, focus = false): boolean => {
    if (!view || busy.has(id)) return false
    const from = columnOfCard(view, id)
    if (!from || from === to) return false
    const title = view[from].find((i) => i.id === id)!.title
    // A stale Undo for this card must not undo this move.
    const stale = toastIds.current.get(id)
    if (stale) toast.dismiss(stale)
    const toastId = `${id}-${++moveCount.current}`
    toastIds.current.set(id, toastId)
    setMoves((m) => ({ ...m, [id]: { from, to, at: new Date(), settled: false } }))
    markFresh(id, focus)
    mutation.mutate({ id, title, from, to, toastId })
    return true
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    setFrozen(view ?? null)
    setActiveId(String(active.id))
    setInstantDrop(false)
  }

  const onDragEnd = ({ active, over, activatorEvent }: DragEndEvent) => {
    // Unfreeze and apply the move in this one event, before anything awaits: no fly-back.
    setFrozen(null)
    setActiveId(null)
    const to = over && isRoadmapStatus(String(over.id)) ? (String(over.id) as RoadmapStatus) : null
    if (!to) return
    const moved = startMove(String(active.id), to, activatorEvent instanceof KeyboardEvent)
    setInstantDrop(moved)
  }

  const onDragCancel = () => {
    setFrozen(null)
    setActiveId(null)
  }

  return { view, busy, fresh, activeId, instantDrop, startMove, markFresh, onDragStart, onDragEnd, onDragCancel }
}
