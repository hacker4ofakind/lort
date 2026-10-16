import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { userPb } from './pb';
import { useVote } from './queries';
import type { Item, Page } from './types';

const feedKey = ['feed', 'board', {}];

function setup(item: Partial<Item>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const page = { page: 1, perPage: 20, totalItems: 1, items: [{ id: 'r1', ...item } as Item] } as Page;
  qc.setQueryData<InfiniteData<Page>>(feedKey, { pages: [page], pageParams: [1] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useVote(), { wrapper });
  const current = () => qc.getQueryData<InfiniteData<Page>>(feedKey)!.pages[0].items[0];
  return { result, current };
}

afterEach(() => vi.restoreAllMocks());

describe('useVote', () => {
  it('shows the vote at once, then keeps what the server says', async () => {
    let answer!: (v: unknown) => void;
    vi.spyOn(userPb, 'send').mockReturnValue(new Promise((r) => (answer = r)));
    const { result, current } = setup({ voted: false, votes: 4 });
    act(() => result.current.mutate('r1'));
    await waitFor(() => expect(current()).toMatchObject({ voted: true, votes: 5 }));
    // Someone else voted meanwhile: the server's count wins.
    await act(async () => answer({ voted: true, votes: 6 }));
    await waitFor(() => expect(current()).toMatchObject({ voted: true, votes: 6 }));
  });

  it('puts the count back when the vote fails', async () => {
    let fail!: (e: unknown) => void;
    vi.spyOn(userPb, 'send').mockReturnValue(new Promise((_, r) => (fail = r)));
    const { result, current } = setup({ voted: true, votes: 5 });
    act(() => result.current.mutate('r1'));
    await waitFor(() => expect(current()).toMatchObject({ voted: false, votes: 4 }));
    await act(async () => fail(new Error('offline')));
    await waitFor(() => expect(current()).toMatchObject({ voted: true, votes: 5 }));
  });
});
