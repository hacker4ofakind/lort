"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** [ready, start]: after start(), ready is false for ms. The refresh buttons use 10 seconds. */
export function useCooldown(ms: number): [boolean, () => void] {
  const [ready, setReady] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const start = useCallback(() => {
    setReady(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setReady(true), ms)
  }, [ms])
  return [ready, start]
}
