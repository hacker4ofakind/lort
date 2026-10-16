// Turns the owner's primary colour into the tokens that use it, keeping WCAG AA contrast in
// both themes: on-primary (text on a primary fill), primary-text (primary as text) and
// primary-soft (a quiet primary tint behind primary-text).

type RGB = [number, number, number];

/** The grounds primary-text and primary-soft sit on, per theme (DESIGN.md). */
export const GROUNDS = {
  dark: { ground: '#1a1716', surface: '#24201e', surface2: '#2c2725' },
  light: { ground: '#f3f1ef', surface: '#ffffff', surface2: '#efeae6' },
} as const;

const WHITE = '#ffffff';
const INK = '#1e1a18';
const AA = 4.5;

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const unlin = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// OKLCH, so lightness can move without the hue drifting.
function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function fromOklch([L, C, h]: [number, number, number]): string {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return toHex([
    unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** Moves hex's OKLCH lightness in `direction` until ok() passes (or lightness runs out). */
function nudge(hex: string, direction: 1 | -1, ok: (c: string) => boolean): string {
  const [L, C, h] = toOklch(hex);
  for (let step = 0; step <= 100; step++) {
    const next = Math.min(1, Math.max(0, L + direction * step * 0.01));
    // Fade chroma near the ends so the colour stays inside sRGB.
    const candidate = fromOklch([next, C * Math.min(1, (1 - Math.abs(next - 0.5) * 2) * 2.5), h]);
    if (ok(candidate)) return candidate;
  }
  return direction === 1 ? WHITE : INK;
}

function mix(a: string, b: string, amount: number): string {
  const [ra, ga, ba] = parseHex(a) ?? [0, 0, 0];
  const [rb, gb, bb] = parseHex(b) ?? [0, 0, 0];
  return toHex([ra * amount + rb * (1 - amount), ga * amount + gb * (1 - amount), ba * amount + bb * (1 - amount)]);
}

export interface BrandTokens {
  primary: string;
  onPrimary: string;
  primaryText: string;
  primarySoft: string;
}

/** Derives the primary-based tokens for both themes from any #rrggbb colour. */
export function deriveBrand(input: string): { dark: BrandTokens; light: BrandTokens } {
  let primary = toHex(parseHex(input) ?? parseHex('#cc3a6d')!);
  let onPrimary = WHITE;
  if (contrast(primary, WHITE) < AA) {
    if (contrast(primary, INK) >= AA) onPrimary = INK;
    else primary = nudge(primary, -1, (c) => contrast(c, WHITE) >= AA);
  }
  const theme = (mode: 'dark' | 'light'): BrandTokens => {
    const g = GROUNDS[mode];
    const primarySoft = mode === 'dark' ? mix(primary, g.ground, 0.2) : mix(primary, WHITE, 0.13);
    const readable = (c: string) => [g.ground, g.surface, g.surface2, primarySoft].every((bg) => contrast(c, bg) >= AA);
    const primaryText = readable(primary) ? primary : nudge(primary, mode === 'dark' ? 1 : -1, readable);
    return { primary, onPrimary, primaryText, primarySoft };
  };
  return { dark: theme('dark'), light: theme('light') };
}

/** CSS that applies a brand to the page, in the same theme structure as tokens.css. */
export function brandCss(input: string): string {
  const { dark, light } = deriveBrand(input);
  const vars = (t: BrandTokens) =>
    `--primary:${t.primary};--on-primary:${t.onPrimary};--primary-text:${t.primaryText};--primary-soft:${t.primarySoft};`;
  return (
    `:root,[data-theme="dark"]{${vars(dark)}}` +
    `@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${vars(light)}}}` +
    `[data-theme="light"]{${vars(light)}}`
  );
}

/** The eight presets in Settings → Branding. */
export const PRESETS = [
  { name: 'Pink', hex: '#cc3a6d' },
  { name: 'Coral', hex: '#d4553a' },
  { name: 'Amber', hex: '#b7791f' },
  { name: 'Leaf', hex: '#2f855a' },
  { name: 'Teal', hex: '#0f8a8a' },
  { name: 'Ocean', hex: '#2563eb' },
  { name: 'Grape', hex: '#7c4dcc' },
  { name: 'Graphite', hex: '#4b5563' },
] as const;
