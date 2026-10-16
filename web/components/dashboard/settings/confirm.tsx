'use client';

import { useState, type ReactNode } from 'react';

import { Button } from '@/components/lort';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export interface ConfirmInput {
  title: string;
  /** What goes with it, so nobody is surprised. */
  description: string;
  /** The confirming button's label, e.g. "Delete" or "Remove". */
  action: string;
  onConfirm: () => Promise<void>;
}

/** Asks before something that can't be undone. Returns `confirm(input)` and the dialog to render. */
export function useConfirm(): [(input: ConfirmInput) => void, ReactNode] {
  const [asking, setAsking] = useState<ConfirmInput | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      await asking.onConfirm();
    } finally {
      setBusy(false);
      setAsking(null);
    }
  };

  const dialog = (
    <Dialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
      <DialogContent showCloseButton={false} className="lt-dialog max-w-[440px] sm:max-w-[440px]">
        <DialogTitle className="title">{asking?.title}</DialogTitle>
        <DialogDescription style={{ margin: 0, color: 'var(--ink-2)' }}>{asking?.description}</DialogDescription>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" onClick={() => setAsking(null)}>
            Keep it
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            {asking?.action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return [setAsking, dialog];
}
