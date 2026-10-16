'use client';

import { useQuery } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import { adminPb } from './pb';
import { keys } from './queries';
import type { Member, Stats } from './types';

/** Every board, private ones included, in display order. */
export function useAllBoards() {
  return useQuery({
    queryKey: ['boards'],
    queryFn: () => adminPb.collection('boards').getFullList({ sort: 'order,created' }),
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => adminPb.collection('tags').getFullList({ sort: 'order,created' }),
  });
}

/** The single settings record. */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => adminPb.collection('settings').getFirstListItem<RecordModel>(''),
  });
}

export function useStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: () => adminPb.send<Stats>('/api/lort/stats', {}),
    refetchInterval: 60_000,
  });
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: () => adminPb.send<{ items: Member[]; you: string }>('/api/lort/team', {}),
  });
}
