import { deriveBrand } from "@/lib/colors"
import type { SiteConfig } from "@/lib/config"

export interface Favicon {
  url: string
  type: string
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

/**
 * The browser tab icon: the owner's logo at 64x64 (PocketBase's thumb; an SVG logo scales on its
 * own), or, without a logo, the same letter mark the top bar shows, as an inline SVG.
 */
export function favicon(config: Pick<SiteConfig, "appName" | "logo" | "primaryColor">): Favicon {
  if (config.logo) {
    if (/\.svg$/i.test(config.logo)) return { url: config.logo, type: "image/svg+xml" }
    return { url: `${config.logo}?thumb=64x64`, type: /\.webp$/i.test(config.logo) ? "image/webp" : "image/png" }
  }
  const { primary, onPrimary } = deriveBrand(config.primaryColor)
  const letter = (config.appName.trim()[0] ?? "L").toUpperCase().replace(/[&<>"']/g, (c) => ESCAPES[c])
  // The logo mark: a rounded square tilted −4°, inset so the tilted corners stay inside the icon.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect x="4" y="4" width="56" height="56" rx="16" fill="${primary}" transform="rotate(-4 32 32)"/>` +
    `<text x="32" y="33" fill="${onPrimary}" font-family="'Bricolage Grotesque',system-ui,sans-serif" font-size="34" ` +
    `font-weight="800" text-anchor="middle" dominant-baseline="central" transform="rotate(-4 32 32)">${letter}</text>` +
    `</svg>`
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, type: "image/svg+xml" }
}
