"use client"

import { useEffect, useRef } from "react"
import { Spinner } from "@/components/ui/spinner"

/** Infinite scroll: calls onVisible when this sentinel nears the viewport, while there is more to load. */
export function LoadMore({ hasMore, loading, onVisible }: { hasMore: boolean; loading: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(onVisible)
  useEffect(() => {
    latest.current = onVisible
  })
  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && latest.current(), {
      rootMargin: "400px",
    })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore])
  if (!hasMore) return null
  return (
    <div ref={ref} className="flex justify-center py-6 text-muted-foreground" aria-hidden={!loading}>
      {loading && <Spinner className="size-5" aria-label="Loading more" />}
    </div>
  )
}
