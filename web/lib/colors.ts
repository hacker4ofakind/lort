// Derives the tokens that depend on the owner's primary colour, keeping WCAG AA contrast.
// primary-soft is not here: globals.css mixes it from --primary with color-mix().

type RGB = [number, number, number] // sRGB channels, 0–1
type OKLCH = [number, number, number] // lightness 0–1, chroma, hue in degrees

export const INK = "#1e1a18"
export const WHITE = "#ffffff"
/** The grounds primary-text must stay readable on, per theme: ground and card surface. */
export const GROUNDS = { light: ["#f3f1ef", "#ffffff"], dark: ["#1a1716", "#24201e"] } as const
export const MIN_CONTRAST = 4.5

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function toHex([r, g, b]: RGB): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${c(r)}${c(g)}${c(b)}`
}

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(parseHex(a) ?? [0, 0, 0])
  const lb = luminance(parseHex(b) ?? [0, 0, 0])
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function toOklch(rgb: RGB): OKLCH {
  const [r, g, b] = rgb.map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}

function fromOklch([L, C, h]: OKLCH): RGB {
  const A = C * Math.cos((h * Math.PI) / 180)
  const B = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb: RGB = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return rgb.map((v) => Math.min(1, Math.max(0, gamma(v)))) as RGB
}

/** Moves hex's OKLCH lightness in steps of 0.01 (up or down) until ok() holds. */
function nudge(hex: string, direction: 1 | -1, ok: (candidate: string) => boolean): string {
  const [L, C, h] = toOklch(parseHex(hex)!)
  for (let i = 0; i <= 100; i++) {
    const candidate = toHex(fromOklch([Math.min(1, Math.max(0, L + direction * i * 0.01)), C, h]))
    if (ok(candidate)) return candidate
  }
  return direction > 0 ? WHITE : INK
}

const readableOn = (grounds: readonly string[]) => (c: string) =>
  grounds.every((g) => contrast(c, g) >= MIN_CONTRAST)

export interface Brand {
  /** The primary fill. Equal to the owner's colour unless neither white nor ink could sit on it. */
  primary: string
  /** Text and icons on a primary fill. */
  onPrimary: string
  /** Primary as text or an outline, per theme. */
  primaryText: { light: string; dark: string }
}

/** Builds the brand tokens for an owner's colour. Invalid input falls back to Lort Pink. */
export function deriveBrand(input: string): Brand {
  let primary = parseHex(input) ? toHex(parseHex(input)!) : "#cc3a6d"
  const best = () => (contrast(primary, WHITE) >= contrast(primary, INK) ? WHITE : INK)
  let onPrimary = best()
  if (contrast(primary, onPrimary) < MIN_CONTRAST) {
    // Darken toward white text or lighten toward ink text, whichever is nearer.
    const dir = onPrimary === WHITE ? -1 : 1
    primary = nudge(primary, dir, (c) => contrast(c, onPrimary) >= MIN_CONTRAST)
    onPrimary = best()
  }
  return {
    primary,
    onPrimary,
    primaryText: {
      light: nudge(primary, -1, readableOn(GROUNDS.light)),
      dark: nudge(primary, 1, readableOn(GROUNDS.dark)),
    },
  }
}

/** The inline stylesheet the root layout injects to apply the owner's colour in both themes. */
export function brandCss(input: string): string {
  const b = deriveBrand(input)
  const shared = `--primary:${b.primary};--primary-foreground:${b.onPrimary};`
  return `:root{${shared}--primary-text:${b.primaryText.light}}.dark{${shared}--primary-text:${b.primaryText.dark}}`
}
