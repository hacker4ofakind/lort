import type { CSSProperties } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * One skeleton bone: a surface-2 pill that pulses (static under reduced motion). Title bones
 * pass className="rounded-[12px]". Page skeletons set aria-busy="true" on their container.
 */
export function Bone({ w, h, className, style }: { w: number | string; h: number; className?: string; style?: CSSProperties }) {
  return <Skeleton aria-hidden style={{ width: w, height: h, ...style }} className={cn("shrink-0", className)} />
}
