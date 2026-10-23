import type { ChangelogLabel } from "@/lib/api"
import { labelName, sortLabels } from "@/lib/changelog"
import { cn } from "@/lib/utils"

/**
 * A post's labels as small pills, always New, Improved, Fixed. New sits on the primary tint; its
 * text is ink, because primary-text only reaches 4.5:1 on ground and surface, not on the tint.
 */
export function LabelChips({ labels, className }: { labels: ChangelogLabel[]; className?: string }) {
  const sorted = sortLabels(labels)
  if (sorted.length === 0) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Labels">
      {sorted.map((l) => (
        <li
          key={l}
          className={cn(
            "rounded-full px-2.5 py-[3px] text-[12px] leading-4 font-bold",
            l === "new" ? "bg-primary-soft text-foreground" : "bg-surface-2 text-ink-2"
          )}
        >
          {labelName(l)}
        </li>
      ))}
    </ul>
  )
}
