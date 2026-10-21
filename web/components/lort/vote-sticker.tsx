"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export interface VoteStickerProps {
  /** Votes, including the viewer's when voted. */
  count: number
  voted: boolean
  onToggle?: () => void
  size?: "md" | "sm"
  /** Public roadmap: shows the count, isn't a control. Closed and merged requests too. */
  readOnly?: boolean
  /** The request title, for the accessible name. */
  subject?: string
  className?: string
}

const SLAP = { scale: [1.15, 1], rotate: [0, -7] }
const PEEL = { scale: [1, 1.06, 1], rotate: [-7, -14, 0] }
const SLAP_T = { type: "spring" as const, stiffness: 520, damping: 18, mass: 0.7 }
const PEEL_T = { duration: 0.16, ease: "easeOut" as const }

/**
 * The upvote: an empty dashed spot that becomes a sticker slapped onto the card (scale 1.15 → 1,
 * rotate to −7°) and peels off again. MotionConfig reducedMotion="user" in the providers makes
 * both instant for visitors who ask for less motion.
 */
export function VoteSticker({ count, voted, onToggle, size = "md", readOnly, subject, className }: VoteStickerProps) {
  const classes = cn(
    "relative inline-flex shrink-0 items-center justify-center rounded-full font-display text-count tabular-nums",
    size === "md" ? "size-[58px]" : "size-10 text-sm",
    voted
      ? "border-3 border-keyline bg-primary text-primary-foreground shadow-sticker"
      : "border-2 border-dashed border-dot-empty text-foreground",
    !readOnly && !voted && "transition-colors hover:border-muted-foreground",
    className
  )

  const votes = count === 1 ? "1 vote" : `${count} votes`

  if (readOnly) {
    return (
      <span className={cn(classes, voted && "-rotate-7")} aria-label={voted ? `${votes}, including yours` : votes}>
        {count}
      </span>
    )
  }

  const about = subject ? ` ${subject}` : " this"
  return (
    <motion.button
      type="button"
      className={classes}
      aria-pressed={voted}
      aria-label={voted ? `Remove your upvote from${about}, ${votes}` : `Upvote${about}, ${votes}`}
      onClick={onToggle}
      initial={false}
      animate={voted ? SLAP : PEEL}
      transition={voted ? SLAP_T : PEEL_T}
    >
      {count}
    </motion.button>
  )
}
