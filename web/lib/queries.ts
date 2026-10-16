'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type PocketBase from 'pocketbase';

import { adminPb, userPb } from './pb';
import type { Config, Detail, Item, Page } from './types';

/** Who is asking: the public board (as the signed-in user, if any) or the dashboard (superuser). */
export type Scope = 'board' | 'team';

export const pbFor = (scope: Scope): PocketBase => (scope === 'team' ? adminPb : userPb);

export interface FeedFilters {
  sort?: string;
  status?: string[];
  board?: string[];
  tag?: string[];
  visibility?: string;
  q?: string;
}

export const keys = {
  config: ['config'] as const,
  feed: (scope: Scope, f: FeedFilters) => ['feed', scope, f] as const,
  request: (scope: Scope, id: string) => ['request', scope, id] as const,
  similar: (q: string) => ['similar', q] as const,
  stats: ['stats'] as const,
};

export function useConfig() {
  return useQuery({
    queryKey: keys.config,
    queryFn: () => userPb.send<Config>('/api/lort/config', {}),
    staleTime: 60_000,
  });
}

function feedQuery(f: FeedFilters, page: number) {
  return {
    page,
    perPage: 20,
    sort: f.sort ?? '',
    status: (f.status ?? []).join(','),
    board: (f.board ?? []).join(','),
    tag: (f.tag ?? []).join(','),
    visibility: f.visibility ?? '',
    q: f.q ?? '',
  };
}

/** One list of requests, loaded 20 at a time. `live` false switches on a 3-minute poll. */
export function useFeed(scope: Scope, filters: FeedFilters, live = true) {
  return useInfiniteQuery({
    queryKey: keys.feed(scope, filters),
    queryFn: ({ pageParam }) => pbFor(scope).send<Page>('/api/lort/requests', { query: feedQuery(filters, pageParam) }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.perPage < last.totalItems ? last.page + 1 : undefined),
    refetchInterval: live ? false : 180_000,
  });
}

export function useRequest(scope: Scope, id: string) {
  return useQuery({
    queryKey: keys.request(scope, id),
    queryFn: () => pbFor(scope).send<Detail>(`/api/lort/requests/${id}`, {}),
  });
}

export function useSimilar(q: string) {
  const text = q.trim();
  return useQuery({
    queryKey: keys.similar(text),
    queryFn: () => userPb.send<{ items: Item[] }>('/api/lort/similar', { query: { q: text } }),
    enabled: text.length >= 3,
    staleTime: 30_000,
  });
}

/** Applies fn to every cached copy of request id: in each feed page and on its page. */
export function patchRequest(qc: QueryClient, id: string, fn: (it: Item) => Item) {
  qc.setQueriesData<InfiniteData<Page>>(
    { queryKey: ['feed'] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) => ({ ...p, items: p.items.map((it) => (it.id === id ? fn(it) : it)) })),
      },
  );
  qc.setQueriesData<Detail>({ queryKey: ['request'] }, (d) => (d && d.id === id ? { ...d, ...fn(d) } : d));
}

/** Toggles the viewer's vote with an optimistic update that rolls back on failure. */
export function useVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      userPb.send<{ voted: boolean; votes: number }>(`/api/lort/requests/${id}/vote`, { method: 'POST' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['feed'] });
      await qc.cancelQueries({ queryKey: ['request'] });
      const snapshot = [...qc.getQueriesData({ queryKey: ['feed'] }), ...qc.getQueriesData({ queryKey: ['request'] })];
      patchRequest(qc, id, (it) => ({ ...it, voted: !it.voted, votes: it.votes + (it.voted ? -1 : 1) }));
      return { snapshot };
    },
    onError: (_err, _id, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: (res, id) => patchRequest(qc, id, (it) => ({ ...it, voted: res.voted, votes: res.votes })),
  });
}

/**
 * Keeps request lists fresh: subscribes to PocketBase realtime (which applies the same access
 * rules as the API) and refetches on any change. Returns whether the connection is up and the
 * ids created since the page opened, for the "new" tint.
 */
export function useLiveRequests(scope: Scope) {
  const qc = useQueryClient();
  const [live, setLive] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const pb = pbFor(scope);
    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    const refetch = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['feed', scope] });
        qc.invalidateQueries({ queryKey: ['request', scope] });
        if (scope === 'team') qc.invalidateQueries({ queryKey: keys.stats });
      }, 300);
    };
    pb.realtime.onDisconnect = () => !cancelled && setLive(false);
    Promise.all([
      pb.collection('requests').subscribe('*', (e) => {
        if (e.action === 'create') setFresh((s) => new Set(s).add(e.record.id));
        refetch();
      }),
      pb.collection('comments').subscribe('*', refetch),
    ])
      .then((subs) => {
        if (cancelled) return subs.forEach((u) => u());
        unsubscribe = async () => void (await Promise.all(subs.map((u) => u())));
        setLive(true);
      })
      .catch(() => !cancelled && setLive(false));
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      void unsubscribe?.();
    };
  }, [scope, qc]);

  return { live, fresh };
}
