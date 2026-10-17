"use client"

import { IconGitMerge, IconPlayerSkipForward, IconRotateClockwise, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { triageActions, type Status, type TriageAction } from "@/lib/status"
import { cn } from "@/lib/utils"

const ICONS = {
  x: IconX,
  merge: IconGitMerge,
  skip: IconPlayerSkipForward,
  rotate: IconRotateClockwise,
}

const VARIANT = { primary: "default", danger: "destructive", neutral: "neutral", quiet: "ghost" } as const

export interface TriageBarProps {
  status: Status
  onAction: (action: TriageAction) => void
  /** The action whose request is in flight; every button is disabled meanwhile. */
  busy?: TriageAction["id"] | null
  className?: string
}

/** The floating bar on a dashboard request page that moves the request on; the forward action is last and primary. */
export function TriageBar({ status, onAction, busy, className }: TriageBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Triage"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-2 p-1.5 inset-shadow-sm shadow-float",
        className
      )}
    >
      {triageActions(status).map((a) => {
        const Icon = a.icon ? ICONS[a.icon] : null
        return (
          <Button
            key={a.id}
            variant={VARIANT[a.tone]}
            className={cn(a.tone === "primary" && "ml-1")}
            disabled={!!busy}
            aria-busy={busy === a.id}
            onClick={() => onAction(a)}
          >
            {Icon && <Icon />}
            {a.label}
          </Button>
        )
      })}
    </div>
  )
}
