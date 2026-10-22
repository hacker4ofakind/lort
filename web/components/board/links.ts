import type { SiteConfig } from "@/lib/config"

/** Where "Powered by Lort" and "Get your own board like this" point. Phase 6 switches the card to /lort-landing. */
export const LORT_HOME = "https://github.com/hacker4ofakind/lort"

/**
 * The public nav. Roadmap shows only while the team keeps it public, Changelog once a post is
 * published (/changelog itself always works by its address).
 */
export function boardNav(config: SiteConfig): { href: string; label: string }[] {
  return [
    { href: "/feedback", label: "Feedback" },
    ...(config.roadmapPublic ? [{ href: "/roadmap", label: "Roadmap" }] : []),
    ...(config.changelog ? [{ href: "/changelog", label: "Changelog" }] : []),
  ]
}
