import { describe, expect, it } from 'vitest';

import { GROUNDS, PRESETS, brandCss, contrast, deriveBrand, parseHex } from './color';

describe('contrast', () => {
  it('matches WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#cc3a6d', '#ffffff')).toBeCloseTo(4.78, 2);
  });
});

describe('deriveBrand', () => {
  const inputs = [...PRESETS.map((p) => p.hex), '#ffff00', '#777777', '#000000', '#ffffff', '#00ff88'];

  it.each(inputs)('keeps every pairing readable for %s', (hex) => {
    const brand = deriveBrand(hex);
    for (const mode of ['dark', 'light'] as const) {
      const t = brand[mode];
      expect(contrast(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(4.5);
      for (const bg of [...Object.values(GROUNDS[mode]), t.primarySoft]) {
        expect(contrast(t.primaryText, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps Lort pink as it is, with white text on it', () => {
    const { dark, light } = deriveBrand('#cc3a6d');
    expect(dark.primary).toBe('#cc3a6d');
    expect(light.primary).toBe('#cc3a6d');
    expect(dark.onPrimary).toBe('#ffffff');
    // Pink is too dark to read as text on charcoal, so the dark theme lightens it.
    expect(dark.primaryText).not.toBe('#cc3a6d');
  });

  it('puts dark text on light primaries instead of changing them', () => {
    expect(deriveBrand('#ffff00').dark).toMatchObject({ primary: '#ffff00', onPrimary: '#1e1a18' });
  });

  it('falls back to Lort pink for anything that is not #rrggbb', () => {
    expect(deriveBrand('red').dark.primary).toBe('#cc3a6d');
  });
});

describe('brandCss', () => {
  it('writes both themes', () => {
    const css = brandCss('#2563eb');
    expect(css).toContain('--primary:#2563eb');
    expect(css).toContain('prefers-color-scheme: light');
    expect(css).toContain('[data-theme="light"]');
  });
});

it('parses hex with or without #', () => {
  expect(parseHex('cc3a6d')).toEqual([204, 58, 109]);
  expect(parseHex('#zzz')).toBeNull();
});
