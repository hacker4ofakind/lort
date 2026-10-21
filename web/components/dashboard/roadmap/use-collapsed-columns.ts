"use client"

import { useMemo, useSyncExternalStore } from "react"
import type { RoadmapStatus } from "@/lib/api"
import { parseCollapsed, readCollapsedRaw, writeCollapsed } from "@/lib/roadmap"

// The snapshot is the stored string: an array would be a new object on every read and loop
// forever (the trap lib/auth.ts documents). `storage` events only reach other tabs, so this tab
// tells its own subscribers when it writes.
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

/** Which roadmap columns are collapsed to a strip, remembered per browser. Default: none. */
export function useCollapsedColumns() {
  // "[]" on the server and during hydration, so the first paint always matches.
  const raw = useSyncExternalStore(subscribe, readCollapsedRaw, () => "[]")
  const collapsed = useMemo(() => parseCollapsed(raw), [raw])

  const toggle = (status: RoadmapStatus) => {
    const next = collapsed.includes(status) ? collapsed.filter((s) => s !== status) : [...collapsed, status]
    writeCollapsed(next)
    listeners.forEach((l) => l())
  }

  return { collapsed, toggle }
}
