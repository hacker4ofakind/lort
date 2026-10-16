import { describe, expect, it } from 'vitest';
import { ClientResponseError } from 'pocketbase';

import { errorMessage } from './errors';

const fail = (status: number, response: object) => new ClientResponseError({ status, response });

describe('errorMessage', () => {
  it('uses the server message', () => {
    expect(errorMessage(fail(400, { message: 'Pick a board for your idea.' }))).toBe('Pick a board for your idea.');
  });
  it('explains rate limits and lost connections', () => {
    expect(errorMessage(fail(429, { message: 'Too Many Requests.' }))).toMatch(/a bit fast/);
    expect(errorMessage(fail(0, {}))).toMatch(/Can't reach/);
  });
  it('prefers a field error over a generic message', () => {
    const err = fail(400, {
      message: 'Failed to create record.',
      data: { title: { message: 'Must be at least 3 character(s).' } },
    });
    expect(errorMessage(err)).toBe('Must be at least 3 character(s).');
  });
  it('falls back to a friendly sentence', () => {
    expect(errorMessage(new Error('boom'))).toMatch(/still here/);
  });
});
