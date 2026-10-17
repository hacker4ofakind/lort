"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { IconSearch } from "@tabler/icons-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { boardSearch, parseBoardFilters } from "@/lib/filters"
import { cn } from "@/lib/utils"

const onBoard = (path: string) => path === "/" || path === "/feedback"

/**
 * The top bar's search. On the board it filters as you type (the q parameter, 300 ms after the
 * last key); anywhere else Enter opens the board with the search applied.
 */
export function SearchField({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const urlQ = onBoard(pathname) ? (params.get("q") ?? "") : ""
  const [q, setQ] = useState(urlQ)
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ)
  if (urlQ !== prevUrlQ) {
    // The URL changed under us (back button, "Clear filters"): follow it.
    setPrevUrlQ(urlQ)
    setQ(urlQ)
  }

  useEffect(() => {
    if (!onBoard(pathname) || q === urlQ) return
    const t = setTimeout(() => {
      router.replace(`${pathname}${boardSearch({ ...parseBoardFilters(params), q })}`, { scroll: false })
    }, 300)
    return () => clearTimeout(t)
  }, [q, urlQ, pathname, params, router])

  return (
    <form
      role="search"
      className={cn("w-60", className)}
      onSubmit={(e) => {
        e.preventDefault()
        if (!onBoard(pathname)) router.push(`/feedback${boardSearch({ ...parseBoardFilters(new URLSearchParams()), q })}`)
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          <IconSearch className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          placeholder="Search ideas"
          aria-label="Search ideas"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
        />
      </InputGroup>
    </form>
  )
}
