interface FileOptions {
  thumb?: string // "100x100", see PocketBase thumb formats
  token?: string // a file token, needed for protected files the visitor can't see anonymously
}

/** URL of a file on a record. */
export function fileUrl(collection: string, recordId: string, filename: string, opts: FileOptions = {}): string {
  const q = new URLSearchParams()
  if (opts.thumb) q.set("thumb", opts.thumb)
  if (opts.token) q.set("token", opts.token)
  const s = q.toString()
  return `/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}${s ? `?${s}` : ""}`
}

/** A person's avatar thumbnail, or undefined for the initial fallback. */
export function avatarUrl(p: { id: string; avatar?: string }, size = 100): string | undefined {
  return p.id && p.avatar ? fileUrl("users", p.id, p.avatar, { thumb: `${size}x${size}` }) : undefined
}
