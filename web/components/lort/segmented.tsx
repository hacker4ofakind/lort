"use client"

import { useId } from "react"
import { motion } from "motion/react"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup } from "@/components/ui/toggle-group"

export interface SegmentedProps {
  options: { value: string; label: string }[]
  value: string
  onValueChange: (value: string) => void
  "aria-label": string
}

/** Pick one of a few options (the Suggest modal's board): the SortTabs look, as toggle buttons. */
export function Segmented({ options, value, onValueChange, "aria-label": label }: SegmentedProps) {
  const layoutId = useId()
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v) => v[0] && onValueChange(v[0])}
      className="rounded-full border border-border bg-background p-1 inset-shadow-sm"
      spacing={0}
    >
      {options.map((o) => (
        <Toggle key={o.value} value={o.value} variant="segment">
          {o.value === value && (
            <motion.span
              layoutId={layoutId}
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full bg-foreground"
              transition={{ type: "spring", bounce: 0.18, duration: 0.35 }}
            />
          )}
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
