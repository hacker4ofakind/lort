import { describe, expect, it } from 'vitest';

import { DEFAULT_BRAND, parseBrand } from './brand';

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64');

describe('parseBrand', () => {
  it('reads the header and keeps defaults for anything missing', () => {
    const brand = parseBrand(
      encode({ appName: 'Driftnote — notes', primaryColor: '#2563eb', features: { email: true } }),
    );
    expect(brand.appName).toBe('Driftnote — notes');
    expect(brand.primaryColor).toBe('#2563eb');
    expect(brand.features).toEqual({ email: true, voice: false, turnstile: false });
    expect(brand.roadmapPublic).toBe(true);
  });
  it('falls back to defaults without a header or with a bad one', () => {
    expect(parseBrand(null)).toEqual(DEFAULT_BRAND);
    expect(parseBrand('not base64 json')).toEqual(DEFAULT_BRAND);
  });
});
