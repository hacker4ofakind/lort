import { describe, expect, it } from 'vitest';

import { shortDate, timeAgo } from './time';

const now = new Date('2026-10-15T12:00:00Z');

describe('timeAgo', () => {
  it('reads like a person would say it', () => {
    expect(timeAgo('2026-10-15T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-15T10:00:00Z', now)).toBe('2 hours ago');
    expect(timeAgo('2026-10-14T12:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-09-24T12:00:00Z', now)).toBe('3 weeks ago');
  });
});

describe('shortDate', () => {
  it('drops the year when it is this year', () => {
    expect(shortDate('2026-10-11T09:00:00Z', now)).toBe('11 Oct');
    expect(shortDate('2025-10-11T09:00:00Z', now)).toBe('11 Oct 2025');
  });
});
