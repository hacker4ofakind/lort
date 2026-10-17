import type { ReactNode } from "react"
import { IconLock } from "@tabler/icons-react"

export interface InternalNoteProps {
  author: string
  /** Relative time, e.g. "1 hour ago". */
  time: string
  /** Optional controls at the end of the header (Delete). */
  actions?: ReactNode
  children: ReactNode
}

/** A comment only the team sees, set apart so nobody mistakes it for a public reply. */
export function InternalNote({ author, time, actions, children }: InternalNoteProps) {
  return (
    <div className="rounded-lg border-2 border-dashed border-note-border bg-note-bg px-[18px] py-3.5">
      <div className="flex flex-wrap items-center gap-2 text-caption text-foreground">
        <b className="font-bold">{author}</b>
        <span className="inline-flex items-center gap-1 font-semibold text-note-ink">
          <IconLock className="size-[13px]" />
          Only the team sees this
        </span>
        <span className="text-muted-foreground">· {time}</span>
        {actions && <span className="ml-auto">{actions}</span>}
      </div>
      <div className="mt-1.5 text-body whitespace-pre-wrap text-ink-2">{children}</div>
    </div>
  )
}
