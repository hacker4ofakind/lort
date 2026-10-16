'use client';

import { useQueryClient } from '@tanstack/react-query';

import { STATUS, type TriageAction } from '@/components/lort';
import { useBrand } from '@/components/board/brand';
import { errorMessage } from '@/lib/errors';
import { adminPb } from '@/lib/pb';
import { keys } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import type { Change, Detail } from '@/lib/types';

/** Runs a status action from the triage bar or the status chip, with its toast. */
export function useTriage(detail: Detail | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const brand = useBrand();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['request', 'team'] });
    void qc.invalidateQueries({ queryKey: ['feed', 'team'] });
    void qc.invalidateQueries({ queryKey: keys.stats });
  };

  return async (action: TriageAction) => {
    if (!detail || !action.next) return;
    try {
      const ch = await adminPb.send<Change>(`/api/lort/requests/${detail.id}/status`, {
        method: 'POST',
        body: { action: action.id },
      });
      refresh();
      if (ch.to === 'completed') {
        const people = detail.votes;
        toast({
          // Emails go out after the undo window once email is set up (phase 3).
          message: brand.features.email
            ? `Marked as completed · ${people} ${people === 1 ? 'person' : 'people'} will be notified`
            : 'Marked as completed',
          countdown: 60,
          action: {
            label: 'Undo',
            onAction: async () => {
              try {
                await adminPb.send(`/api/lort/requests/${detail.id}/undo`, { method: 'POST' });
                refresh();
              } catch (err) {
                toast({ message: errorMessage(err) });
              }
            },
          },
        });
      } else if (ch.roadmap === 'added') toast({ message: 'Added to the roadmap' });
      else if (ch.roadmap === 'removed') toast({ message: 'Taken off the roadmap' });
      else toast({ message: `Moved to ${STATUS[ch.to].label}` });
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };
}
