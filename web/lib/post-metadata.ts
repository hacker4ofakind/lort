import type { Metadata } from "next"
import { parsePageMeta } from "@/lib/page-meta"

/**
 * A post page's link-preview metadata from the X-Lort-Page header. The root layout's template
 * adds " · <App>" to the title. Without the header (a draft, a typo) the layout's defaults stand.
 */
export function postMetadata(header: string | null): Metadata {
  const meta = parsePageMeta(header)
  if (!meta) return {}
  const images = meta.image ? [{ url: meta.image, width: 1200, height: 630 }] : undefined
  return {
    title: meta.title,
    description: meta.description || undefined,
    openGraph: {
      type: "article",
      url: meta.url,
      title: meta.title,
      description: meta.description || undefined,
      siteName: meta.appName || undefined,
      images,
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description || undefined, images },
  }
}
