import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { deriveBrand } from "@/lib/colors"
import type { SiteConfig } from "@/lib/config"
import type { PageMeta } from "@/lib/page-meta"

// The share card a post gets when it has no cover: the board's own look, not Lort's.
// Satori reads TrueType, not woff2, so the static ExtraBold ships next to the web fonts (OFL).
const font = readFile(join(process.cwd(), "app", "fonts", "BricolageGrotesque-ExtraBold.ttf"))

const GROUND = "#1a1716"
const INK = "#f5efea"
const MUTED = "#b3a79e"

/**
 * Text the bundled font can draw: Latin, Latin-1, Latin Extended-A and typographic quotes and
 * dashes. Anything else (emoji, other scripts) is left out, so drawing never fetches a fallback
 * font or Twemoji from the network.
 */
export function drawable(text: string): string {
  return text
    .replace(/[^ -~ -ſ‘’“”–—…]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Cards render on every unfurl, so up to this many are kept, keyed by everything they draw. */
const MAX_CACHED = 64
const cache = new Map<string, ArrayBuffer>()

function remember(key: string, png: ArrayBuffer) {
  cache.delete(key)
  cache.set(key, png)
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!)
}

/** Draws (or serves from memory) the 1200×630 card for a post; 304 when the caller has it. */
export async function shareCard(meta: PageMeta, config: SiteConfig, slug: string, ifNoneMatch: string | null): Promise<Response> {
  const key = createHash("sha256")
    .update(JSON.stringify([slug, meta.title, config.appName, config.primaryColor, config.logo]))
    .digest("hex")
    .slice(0, 32)
  const etag = `"${key}"`
  const headers = { "Content-Type": "image/png", "Cache-Control": "public, max-age=300", ETag: etag }
  if (ifNoneMatch === etag) return new Response(null, { status: 304, headers })

  let png = cache.get(key)
  if (!png) {
    png = await draw(drawable(meta.title), drawable(config.appName), config.primaryColor)
    remember(key, png)
  }
  return new Response(png, { headers })
}

async function draw(title: string, appName: string, primaryColor: string): Promise<ArrayBuffer> {
  const { primary, onPrimary } = deriveBrand(primaryColor)
  const res = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: GROUND,
          color: INK,
          fontFamily: "Bricolage",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: primary,
              color: onPrimary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              transform: "rotate(-4deg)",
            }}
          >
            {(appName[0] ?? "").toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: 36 }}>{appName}</div>
          <div style={{ display: "flex", fontSize: 36, color: MUTED }}>What&apos;s new</div>
        </div>
        {title ? (
          <div style={{ display: "block", fontSize: 76, lineHeight: 1.08, letterSpacing: "-0.02em", lineClamp: 3 }}>{title}</div>
        ) : (
          <div style={{ display: "flex" }} />
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Bricolage", data: await font, weight: 800, style: "normal" }],
    }
  )
  return res.arrayBuffer()
}
