"use client"

import * as React from "react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

const pad = (n: number) => String(n).padStart(2, "0")

function parse(value: string): [string, string] {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  return m ? [m[1], m[2]] : ["", ""]
}

/** "HH:MM" for a complete, real time; "" while a segment is empty or out of range. */
function compose(h: string, m: string): string {
  if (h === "" || m === "") return ""
  const hh = Number(h)
  const mm = Number(m)
  return hh > 23 || mm > 59 ? "" : `${pad(hh)}:${pad(mm)}`
}

const segment = "w-7 flex-none rounded-md px-0 text-center tabular-nums font-semibold focus-visible:bg-accent"

/**
 * A 24-hour time field in two segments (hour, minute), in place of the browser's native time
 * popup. Type digits, or press ArrowUp and ArrowDown to step; the hour hands focus to the minutes
 * once it has two digits. value and onChange use "HH:MM", with "" for an incomplete time.
 */
function TimePicker({
  value,
  onChange,
  label = "At",
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** Names the group and is shown before the segments. */
  label?: string
  className?: string
}) {
  const [[h, m], setParts] = React.useState(() => parse(value))
  // Follow a value set from outside (the menu opening on another time), never our own edits.
  const [prev, setPrev] = React.useState(value)
  if (value !== prev) {
    setPrev(value)
    if (value !== compose(h, m)) setParts(parse(value))
  }
  const minute = React.useRef<HTMLInputElement>(null)

  const set = (nh: string, nm: string) => {
    setParts([nh, nm])
    const next = compose(nh, nm)
    setPrev(next)
    onChange(next)
  }
  const step = (e: React.KeyboardEvent, current: string, max: number, apply: (v: string) => void) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    const n = Number(current || 0) + (e.key === "ArrowUp" ? 1 : -1)
    apply(pad((n + max + 1) % (max + 1)))
  }

  return (
    <InputGroup role="group" aria-label={label} className={cn("h-9 w-fit", className)}>
      <InputGroupAddon className="pr-1.5">{label}</InputGroupAddon>
      <InputGroupInput
        aria-label="Hour"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH"
        maxLength={2}
        value={h}
        className={segment}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2)
          set(v, m)
          if (v.length === 2 && Number(v) <= 23) minute.current?.focus()
        }}
        onFocus={(e) => e.currentTarget.select()}
        // Read the field, not the render's state: focus moves on inside the same event as the last digit.
        onBlur={(e) => e.currentTarget.value.length === 1 && set(pad(Number(e.currentTarget.value)), m)}
        onKeyDown={(e) => step(e, h, 23, (v) => set(v, m))}
      />
      <span aria-hidden className="text-muted-foreground">
        :
      </span>
      <InputGroupInput
        ref={minute}
        aria-label="Minute"
        inputMode="numeric"
        autoComplete="off"
        placeholder="MM"
        maxLength={2}
        value={m}
        className={cn(segment, "mr-3")}
        onChange={(e) => set(h, e.target.value.replace(/\D/g, "").slice(0, 2))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => e.currentTarget.value.length === 1 && set(h, pad(Number(e.currentTarget.value)))}
        onKeyDown={(e) => step(e, m, 59, (v) => set(h, v))}
      />
    </InputGroup>
  )
}

export { TimePicker }
