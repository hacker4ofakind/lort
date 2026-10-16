import { describe, expect, it } from 'vitest';

import { listParam, withParams } from './url-state';

describe('withParams', () => {
  it('sets, joins lists and removes empties', () => {
    expect(withParams('sort=newest&q=dark', { q: null, status: ['pending', 'planned'] })).toBe(
      '?sort=newest&status=pending%2Cplanned',
    );
    expect(withParams('q=dark', { q: '' })).toBe('');
  });
});

describe('listParam', () => {
  it('splits a list and falls back only when the key is absent', () => {
    expect(listParam(new URLSearchParams('status=pending,planned'), 'status')).toEqual(['pending', 'planned']);
    expect(listParam(new URLSearchParams(''), 'status', ['pending'])).toEqual(['pending']);
    expect(listParam(new URLSearchParams('status='), 'status', ['pending'])).toEqual([]);
  });
});
