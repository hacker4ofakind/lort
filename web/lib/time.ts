const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "14 Oct", or "14 Oct 2025" outside the current year. */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, "0")
  const base = `${day} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** "just now", "5 min ago", "2 hours ago", "yesterday", "3 days ago", then shortDate. */
export function relativeTime(iso: string, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`
  const d = Math.floor(h / 24)
  if (d === 1) return "yesterday"
  if (d < 7) return `${d} days ago`
  return shortDate(iso, now)
}
