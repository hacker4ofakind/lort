import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

/** Chip look: 34px pills on surface-2 for status, board, tags, add-tag and the visibility switch. */
export const chipClass =
  "inline-flex h-[34px] items-center gap-[7px] rounded-full bg-surface-2 px-3.5 text-caption font-semibold text-foreground [--si-ground:var(--surface-2)]"

/** The interactive version adds hover; use it as a menu or popover trigger (render={<ChipButton />}). */
export const chipButtonClass = cn(chipClass, "cursor-pointer hover:bg-surface-3 hover:[--si-ground:var(--surface-3)] aria-expanded:bg-surface-3")

/** A read-only chip (public request page). */
export function Chip({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn(chipClass, className)} {...props} />
}

/** A chip that opens an editor in the dashboard. Forwards every prop, so Base UI triggers can render it. */
export function ChipButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} className={cn(chipButtonClass, className)} {...props} />
}
