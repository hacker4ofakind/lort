"use client"

import type { ReactNode } from "react"
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface FilterOption {
  value: string
  label: string
  /** Shown before the label, e.g. a decorative StatusIcon. */
  icon?: ReactNode
}

export interface FilterMenuProps {
  /** Trigger text with nothing (or everything) selected: "All boards". */
  allLabel: string
  /** Plural noun for several: "statuses" makes "3 statuses". */
  noun: string
  options: FilterOption[]
  selected: string[]
  onSelectedChange: (values: string[]) => void
  /** Custom trigger text; return undefined for the default summary. */
  summarize?: (values: string[]) => string | undefined
  /** "up" for the floating bar at the bottom of the board. */
  side?: "top" | "bottom"
  className?: string
}

export function filterSummary(
  p: Pick<FilterMenuProps, "allLabel" | "noun" | "options" | "summarize">,
  values: string[]
): string {
  const custom = p.summarize?.(values)
  if (custom) return custom
  if (values.length === 0 || values.length === p.options.length) return p.allLabel
  if (values.length === 1) return p.options.find((o) => o.value === values[0])?.label ?? p.allLabel
  return `${values.length} ${p.noun}`
}

/** A multi-select filter behind a pill: checkbox items that keep the menu open, Clear at the bottom. */
export function FilterMenu(props: FilterMenuProps) {
  const { allLabel, options, selected, onSelectedChange, side = "bottom", className } = props
  const toggle = (v: string, on: boolean) =>
    onSelectedChange(on ? [...selected, v] : selected.filter((x) => x !== v))
  const Chevron = side === "top" ? IconChevronUp : IconChevronDown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="secondary" className={className} />}>
        {filterSummary(props, selected)}
        <Chevron className="size-[15px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} sideOffset={10} className="min-w-[220px]" aria-label={allLabel}>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={(on) => toggle(o.value, on)}
          >
            {o.icon}
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={selected.length === 0}
          onClick={() => onSelectedChange([])}
          className="text-caption font-semibold text-muted-foreground"
        >
          Clear
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
