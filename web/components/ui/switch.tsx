"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

// Lort: a 30×18 track (dot-empty when off, primary when on) with a 14px thumb.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 data-checked:bg-primary data-unchecked:bg-dot-empty data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[14px] translate-x-0.5 rounded-full bg-keyline transition-transform data-checked:translate-x-[14px] data-checked:bg-primary-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
