import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { userPb } from './pb';
import { ClientResponseError } from 'pocketbase';

import { isRejected, useUser } from './session';

// A token whose payload expires far in the future, so the auth store counts it as valid.
const payload = btoa(JSON.stringify({ exp: 4102444800, id: 'u1', type: 'auth' }));
const token = `x.${payload}.y`;

describe('useUser', () => {
  it('follows sign-in, profile changes and sign-out without re-render loops', () => {
    const { result } = renderHook(() => useUser());
    expect(result.current).toBeNull();
    act(() => userPb.authStore.save(token, { id: 'u1', collectionId: 'c', collectionName: 'users', name: 'mara' }));
    expect(result.current?.name).toBe('mara');
    const first = result.current;
    act(() => userPb.authStore.save(token, { id: 'u1', collectionId: 'c', collectionName: 'users', name: 'Mara K.' }));
    expect(result.current?.name).toBe('Mara K.');
    expect(result.current).not.toBe(first);
    act(() => userPb.authStore.clear());
    expect(result.current).toBeNull();
  });
});

describe('isRejected', () => {
  it('signs out on a refused session, not on a request that never got through', () => {
    expect(isRejected(new ClientResponseError({ status: 401 }))).toBe(true);
    expect(isRejected(new ClientResponseError({ status: 403 }))).toBe(true);
    // Status 0 is an aborted request (navigating away) or no network.
    expect(isRejected(new ClientResponseError({ status: 0, isAbort: true }))).toBe(false);
    expect(isRejected(new ClientResponseError({ status: 500 }))).toBe(false);
    expect(isRejected(new Error('boom'))).toBe(false);
  });
});
