"use client"

import { useEffect, useRef, useState } from "react"

/**
 * A search field whose value lives in the URL. Typing writes the URL (commit) `ms` after the last
 * key; a URL change from anywhere else (Clear filters, back and forward) replaces the field's
 * value. When one of its own writes lands while you're still typing, the newer text stays.
 */
export function useUrlSearch(urlValue: string, commit: (value: string) => void, ms = 300): [string, (value: string) => void] {
  const [value, setValue] = useState(urlValue)
  const [prevUrl, setPrevUrl] = useState(urlValue)
  const [pending, setPending] = useState<string | null>(null) // the last value written, until it lands
  if (urlValue !== prevUrl) {
    setPrevUrl(urlValue)
    if (urlValue === pending) setPending(null)
    else setValue(urlValue)
  }

  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  useEffect(() => {
    if (value === urlValue) return
    const t = setTimeout(() => {
      setPending(value)
      commitRef.current(value)
    }, ms)
    return () => clearTimeout(t)
  }, [value, urlValue, ms])

  return [value, setValue]
}
