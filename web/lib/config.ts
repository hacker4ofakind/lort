// The board's public config. The Go proxy sends it with every page request in the
// X-Lort-Config header (unpadded base64url JSON), so server components never fetch it.

export interface Ref {
  id: string
  name: string
}

export interface SiteConfig {
  appName: string
  logo: string
  primaryColor: string
  showLandingCard: boolean
  roadmapPublic: boolean
  /** Public boards, in order. The first is the default for new suggestions. */
  boards: Ref[]
  tags: Ref[]
  features: { email: boolean; voice: boolean; turnstile: boolean }
  version: string
}

export const CONFIG_HEADER = "x-lort-config"

export const DEFAULT_CONFIG: SiteConfig = {
  appName: "My app",
  logo: "",
  primaryColor: "#cc3a6d",
  showLandingCard: true,
  roadmapPublic: true,
  boards: [],
  tags: [],
  features: { email: false, voice: false, turnstile: false },
  version: "dev",
}

/** Decodes the header. A missing or broken header (Next run without the Go server) gives the defaults. */
export function parseConfig(header: string | null | undefined): SiteConfig {
  if (!header) return DEFAULT_CONFIG
  try {
    const b64 = header.replace(/-/g, "+").replace(/_/g, "/")
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SiteConfig>
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      appName: raw.appName || DEFAULT_CONFIG.appName,
      boards: raw.boards ?? [],
      tags: raw.tags ?? [],
      features: { ...DEFAULT_CONFIG.features, ...raw.features },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}
