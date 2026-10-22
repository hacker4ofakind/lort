import { headers } from "next/headers"
import { CONFIG_HEADER, parseConfig } from "@/lib/config"
import { PAGE_HEADER, parsePageMeta } from "@/lib/page-meta"
import { shareCard } from "@/lib/share-card"

// The generated share card for a published post without a cover. A route handler, not the
// opengraph-image file convention: file-based metadata would override generateMetadata and hide
// the cover. The Go proxy sends X-Lort-Page only for published posts, so anything else is 404.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const h = await headers()
  const meta = parsePageMeta(h.get(PAGE_HEADER))
  if (!meta) return new Response("Not found", { status: 404 })
  return shareCard(meta, parseConfig(h.get(CONFIG_HEADER)), slug, h.get("if-none-match"))
}
