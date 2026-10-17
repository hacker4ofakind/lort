import { cn } from "@/lib/utils"
import { STATUS_META, type Status } from "@/lib/status"

// Static class names (Tailwind only sees whole strings).
const ICON_COLOR: Record<Status, string> = {
  pending: "text-status-pending",
  reviewing: "text-status-reviewing",
  planned: "text-status-planned",
  progress: "text-status-progress",
  completed: "text-status-completed",
  closed: "text-status-closed",
}

const TEXT_COLOR: Record<Status, string> = {
  pending: "text-status-pending-text",
  reviewing: "text-status-reviewing-text",
  planned: "text-status-planned-text",
  progress: "text-status-progress-text",
  completed: "text-status-completed-text",
  closed: "text-status-closed-text",
}

/** SVG path of a circle of radius r (centred in a 16×16 box) filled from the bottom up to fraction f. */
export function fillPath(f: number, r: number): string {
  if (f <= 0) return ""
  if (f >= 1) return `M${8 - r} 8A${r} ${r} 0 1 0 ${8 + r} 8A${r} ${r} 0 1 0 ${8 - r} 8Z`
  const y = 8 + r - 2 * r * f
  const dx = Math.sqrt(r * r - (y - 8) ** 2)
  const n = (v: number) => +v.toFixed(2)
  return `M${n(8 - dx)} ${n(y)}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 0 ${n(8 + dx)} ${n(y)}Z`
}

export interface StatusIconProps {
  status: Status
  /** Pixel size, 14–24 (38 on the landing page). */
  size?: number
  /** The sticker keyline used on public cards and timelines. */
  keyline?: boolean
  /** Decorative when a visible label sits next to it; otherwise it is an image named after the status. */
  decorative?: boolean
  className?: string
}

/**
 * The circle that shows where a request is, filling from the bottom toward Completed.
 * Its inner ground follows --si-ground (default: the card surface) so it matches whatever
 * it sits on: set [--si-ground:var(--surface-2)] on a hovered row, for example.
 */
export function StatusIcon({ status, size = 16, keyline = false, decorative = false, className }: StatusIconProps) {
  const { label, fill } = STATUS_META[status]
  const ring = keyline ? 6.2 : 7
  const inner = keyline ? 4.5 : 5.1
  const ground = "fill-[var(--si-ground,var(--surface))]"
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn("block shrink-0", ICON_COLOR[status], className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
    >
      {!decorative && <title>{label}</title>}
      {keyline && <circle cx="8" cy="8" r="7.6" className="fill-keyline" />}
      <circle cx="8" cy="8" r={ring} className={ground} />
      <circle cx="8" cy="8" r={ring} className="fill-current opacity-30" />
      <circle cx="8" cy="8" r={ring} className="fill-none stroke-current" strokeWidth={keyline ? 1.3 : 1.5} />
      {fill > 0 && <path d={fillPath(fill, inner)} className="fill-current" />}
      {status === "completed" && (
        <path
          d="M5.3 8.2l1.8 1.8l3.6-3.7"
          className="fill-none stroke-[var(--si-ground,var(--surface))]"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {status === "closed" && (
        <path
          d="M6 6l4 4M10 6l-4 4"
          className="fill-none stroke-[var(--si-ground,var(--surface))]"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

/** Icon + label in ink: one of the two forms the Status Label Rule allows. */
export function StatusLabel({
  status,
  size = 16,
  keyline,
  className,
}: Omit<StatusIconProps, "decorative">) {
  return (
    <span className={cn("inline-flex items-center gap-[7px] font-semibold text-foreground", className)}>
      <StatusIcon status={status} size={size} keyline={keyline} decorative />
      {STATUS_META[status].label}
    </span>
  )
}

/** The label in its status colour, no icon: the rule's other form. */
export function StatusText({ status, className }: { status: Status; className?: string }) {
  return <span className={cn("font-semibold", TEXT_COLOR[status], className)}>{STATUS_META[status].label}</span>
}
