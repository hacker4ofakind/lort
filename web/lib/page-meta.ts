// What a changelog post's page and share card need for link previews. The Go proxy sends it in
// the X-Lort-Page header (unpadded base64url JSON) for /changelog/<slug> and
// /changelog-card/<slug> when the post is published, and always drops a visitor's copy.

export const PAGE_HEADER = "x-lort-page"

export interface PageMeta {
  title: string
  description: string
  url: string // the post's absolute address
  image: string // the cover's 1200x630 thumb, or the generated card
  appName: string
}

/** Decodes the header, or null when it is missing or broken. */
export function parsePageMeta(header: string | null | undefined): PageMeta | null {
  if (!header) return null
  try {
    const b64 = header.replace(/-/g, "+").replace(/_/g, "/")
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<PageMeta>
    if (typeof raw.title !== "string" || typeof raw.url !== "string") return null
    return {
      title: raw.title,
      description: raw.description ?? "",
      url: raw.url,
      image: raw.image ?? "",
      appName: raw.appName ?? "",
    }
  } catch {
    return null
  }
}
