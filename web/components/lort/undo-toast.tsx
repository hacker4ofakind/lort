"use client"

import { IconX } from "@tabler/icons-react"
import { toast } from "sonner"

export interface UndoToastOptions {
  message: string
  /** Seconds the undo stays available; drawn as a countdown bar along the bottom. */
  seconds: number
  onUndo: () => void
}

/**
 * A toast with one Undo action and a countdown bar in primary. Sonner has no countdown, so this
 * is a toast.custom(). Sonner wraps custom content in the same styled <li> as every toast (the
 * Toaster's classNames.toast), so this renders only the content, not a second card. It closes
 * itself when the time is up; Undo closes it straight away.
 */
export function undoToast({ message, seconds, onUndo }: UndoToastOptions) {
  return toast.custom(
    (id) => (
      <>
        <span role="status" className="flex-1">
          {message}
        </span>
        <button
          type="button"
          className="h-8 rounded-full px-3 font-bold text-primary-text hover:bg-surface-3"
          onClick={() => {
            toast.dismiss(id)
            onUndo()
          }}
        >
          Undo
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          onClick={() => toast.dismiss(id)}
        >
          <IconX className="size-3.5" />
        </button>
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] w-full origin-left animate-countdown bg-primary motion-reduce:hidden"
          style={{ animationDuration: `${seconds}s` }}
        />
      </>
    ),
    { duration: seconds * 1000 }
  )
}
