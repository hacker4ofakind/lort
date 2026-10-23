// Changelog helpers shared by the public pages and the editor. The server is the authority on
// addresses and states; these only shape what the browser shows and sends.
import type { ChangelogLabel, RequestItem, TeamPost } from "@/lib/api"
import { OPEN_STATUSES } from "@/lib/status"
import { dateTime, relativeTime, shortDate } from "@/lib/time"

/** Every label, in display order. */
export const LABELS: { value: ChangelogLabel; label: string }[] = [
  { value: "new", label: "New" },
  { value: "improved", label: "Improved" },
  { value: "fixed", label: "Fixed" },
]

export function isLabel(v: string): v is ChangelogLabel {
  return LABELS.some((l) => l.value === v)
}

export function labelName(v: ChangelogLabel): string {
  return LABELS.find((l) => l.value === v)?.label ?? v
}

/** labels in display order: New, Improved, Fixed. */
export function sortLabels(labels: ChangelogLabel[]): ChangelogLabel[] {
  return LABELS.map((l) => l.value).filter((v) => labels.includes(v))
}

/** The dashboard's state line: "Draft · edited 2 min ago", "Scheduled · 21 Oct, 09:00", "Published · 09 Oct". */
export function stateText(p: TeamPost, now = new Date()): string {
  switch (p.state) {
    case "scheduled":
      return p.publishAt ? `Scheduled · ${dateTime(p.publishAt)}` : "Scheduled"
    case "published":
      return p.publishedAt ? `Published · ${shortDate(p.publishedAt, now)}` : "Published"
    default:
      return p.updated ? `Draft · edited ${relativeTime(p.updated, now)}` : "Draft"
  }
}

/**
 * Cleans an address as it is typed: lowercase, spaces to hyphens, nothing outside a-z, 0-9 and
 * single hyphens. Edge hyphens stay while typing; trim them before sending.
 */
export function cleanSlugInput(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
}

/** An address ready to send: cleaned, without edge hyphens. */
export function finalSlug(s: string): string {
  return cleanSlugInput(s).replace(/^-+|-+$/g, "")
}

/**
 * The moment a day and an "HH:MM" time mean in the browser's time zone, or null for an empty or
 * impossible time (a browser time field gives "" while a segment is cleared). On a daylight
 * saving gap the browser's own normalisation is accepted.
 */
export function scheduleAt(day: Date, time: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min)
}

const NAME_CHAR = /[A-Za-z0-9_.-]/

/** The post's file names that the markdown links to ("/<name>" not followed by more of a file name). */
export function referencedImages(markdown: string, names: string[]): Set<string> {
  const out = new Set<string>()
  for (const name of names) {
    const needle = `/${name}`
    for (let i = markdown.indexOf(needle); i >= 0; i = markdown.indexOf(needle, i + 1)) {
      const next = markdown[i + needle.length]
      if (next === undefined || !NAME_CHAR.test(next)) {
        out.add(name)
        break
      }
    }
  }
  return out
}

/** How many attached requests a publish would mark as completed: the open ones (merged ones are closed). */
export function attachedToComplete(items: RequestItem[]): number {
  return items.filter((r) => (OPEN_STATUSES as string[]).includes(r.status)).length
}

/** Where a post's file lives. Relative, so it works behind any host. */
export function postFileUrl(postId: string, name: string): string {
  return `/api/files/changelogs/${postId}/${name}`
}
