"use client"

import { useId } from "react"
import { motion } from "motion/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export interface SortOption<T extends string> {
  value: T
  label: string
}

export interface SortTabsProps<T extends string> {
  options: SortOption<T>[]
  value: T
  onValueChange: (value: T) => void
  "aria-label"?: string
  size?: "default" | "sm"
  className?: string
}

/** Segmented tabs whose ink pill slides to the selected option (Motion layoutId). */
export function SortTabs<T extends string>({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel = "Sort",
  size = "default",
  className,
}: SortTabsProps<T>) {
  const layoutId = useId()
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as T)} className={className}>
      <TabsList size={size} aria-label={ariaLabel}>
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value} className="data-active:bg-transparent">
            {o.value === value && (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-foreground"
                transition={{ type: "spring", bounce: 0.18, duration: 0.35 }}
              />
            )}
            <span className={cn(o.value === value && "text-background")}>{o.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
