"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient, type QueryKey } from "@tanstack/react-query"
import type { Client } from "@/lib/pocketbase"

const DEBOUNCE_MS = 300
const POLL_MS = 3 * 60_000
const STATUS_MS = 5_000

/**
 * Keeps lists fresh. Subscribes to a collection over PocketBase realtime (SSE) and invalidates
 * `keys` 300 ms after the last change. Leaving the page cancels a pending refetch, so code that
 * changes data must still invalidate its own queries. While the connection is down it polls
 * every 3 minutes, and it catches up once on reconnect.
 *
 * Returns `live` (realtime connected, for the dashboard's Live indicator). `onCreate` hears
 * about new records, for the "just arrived" tint.
 */
export function useLiveRefresh(
  client: Client,
  collection: string,
  keys: QueryKey[],
  onCreate?: (id: string) => void
): { live: boolean } {
  const qc = useQueryClient()
  const [live, setLive] = useState(false)
  const keysRef = useRef(keys)
  const onCreateRef = useRef(onCreate)
  useEffect(() => {
    keysRef.current = keys
    onCreateRef.current = onCreate
  })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubs: Array<() => Promise<void>> = []
    const keep = (u: () => Promise<void>) => {
      if (cancelled) void u().catch(() => {})
      else unsubs.push(u)
    }
    const refresh = () => keysRef.current.forEach((k) => void qc.invalidateQueries({ queryKey: k }))
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, DEBOUNCE_MS)
    }

    client
      .collection(collection)
      .subscribe("*", (e) => {
        if (e.action === "create") onCreateRef.current?.(e.record.id)
        schedule()
      })
      .then((u) => {
        keep(u)
        if (!cancelled) setLive(true)
      })
      .catch(() => setLive(false))

    let connectedBefore = false
    client.realtime
      .subscribe("PB_CONNECT", () => {
        if (connectedBefore) schedule() // a reconnect: catch up on what was missed
        connectedBefore = true
      })
      .then(keep)
      .catch(() => {})

    const status = setInterval(() => setLive(client.realtime.isConnected), STATUS_MS)
    const poll = setInterval(() => {
      if (!client.realtime.isConnected) refresh()
    }, POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(status)
      clearInterval(poll)
      unsubs.forEach((u) => void u().catch(() => {}))
    }
  }, [client, collection, qc])

  return { live }
}
