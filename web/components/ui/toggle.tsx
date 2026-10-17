"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Lort: "default" is the tag pill of the Suggest modal (primary-soft with a primary-text ring
// when pressed); "segment" is an option in a segmented track (components/lort/segmented.tsx),
// whose pressed pill is drawn by Motion.
const toggleVariants = cva(
  "group/toggle relative isolate inline-flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "h-8 bg-surface-2 px-[13px] text-caption font-semibold text-ink-2 hover:bg-surface-3 data-pressed:bg-primary-soft data-pressed:text-primary-text data-pressed:shadow-[inset_0_0_0_1.5px_var(--primary-text)]",
        segment: "h-[34px] px-4 text-label text-muted-foreground hover:text-foreground data-pressed:text-background",
      },
      // Kept so the generated toggle-group.tsx compiles unchanged; Lort has one size.
      size: {
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
}

export { Toggle, toggleVariants }
