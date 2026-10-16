'use client';

import { useQueryClient } from '@tanstack/react-query';

import { errorMessage } from '@/lib/errors';
import { userPb } from '@/lib/pb';
import { useVote } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import type { Detail } from '@/lib/types';
import { useAuth } from './auth';

/**
 * What a sticker click does. Signed-out visitors sign up first, then the vote is added
 * (never removed: they may have voted before on another device).
 */
export function useVoteAction() {
  const { requireUser } = useAuth();
  const vote = useVote();
  const toast = useToast();
  const qc = useQueryClient();

  return async (id: string) => {
    if (!userPb.authStore.isValid) {
      if (!(await requireUser())) return;
      const fresh = await userPb.send<Detail>(`/api/lort/requests/${id}`, {});
      await qc.invalidateQueries({ queryKey: ['feed'] });
      if (fresh.voted) return;
    }
    vote.mutate(id, { onError: (err) => toast({ message: errorMessage(err) }) });
  };
}
