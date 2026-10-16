'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import { Button } from '@/components/lort';
import { errorMessage } from '@/lib/errors';
import { adminPb } from '@/lib/pb';
import { useTags } from '@/lib/team-queries';
import { useToast } from '@/lib/toast';
import { useConfirm } from './confirm';
import { orderChanges, SortableRows } from './sortable-rows';

export function TagsSection() {
  const tags = useTags().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      await fn();
      if (message) toast({ message });
    } catch (err) {
      toast({ message: errorMessage(err) });
    } finally {
      void qc.invalidateQueries({ queryKey: ['tags'] });
      void qc.invalidateQueries({ queryKey: ['config'] });
    }
  };

  const reorder = (items: RecordModel[]) => {
    qc.setQueryData(['tags'], items);
    void run(() =>
      Promise.all(orderChanges(items).map((c) => adminPb.collection('tags').update(c.id, { order: c.order }))),
    );
  };

  return (
    <section className="sec" id="tags">
      <h2>Tags</h2>
      <p className="lede">Labels you can put on requests. People can pick from these when they suggest something.</p>
      {!tags ? (
        <div className="sk" style={{ height: 80, borderRadius: 12 }} />
      ) : (
        <SortableRows items={tags} label={(t) => t.name} onReorder={reorder}>
          {(t, grip) => (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              {grip}
              <input
                className="set-field"
                aria-label="Tag name"
                defaultValue={t.name}
                maxLength={40}
                style={{ flex: 1, maxWidth: 260 }}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== t.name)
                    void run(() => adminPb.collection('tags').update(t.id, { name }), 'Renamed');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <span style={{ flex: 1 }} />
              <Button
                variant="ghost"
                size="sm"
                icon="x"
                iconOnly
                aria-label={`Delete ${t.name}`}
                onClick={() =>
                  confirm({
                    title: `Delete ${t.name}?`,
                    description: 'It comes off every request that has it.',
                    action: 'Delete',
                    onConfirm: () => run(() => adminPb.collection('tags').delete(t.id), `Deleted ${t.name}`),
                  })
                }
              />
            </div>
          )}
        </SortableRows>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = adding.trim();
          if (!name) return;
          setAdding('');
          void run(() => adminPb.collection('tags').create({ name, order: tags?.length ?? 0 }), `Added ${name}`);
        }}
        style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}
      >
        <input
          className="set-field"
          aria-label="New tag"
          placeholder="New tag"
          value={adding}
          maxLength={40}
          onChange={(e) => setAdding(e.target.value)}
        />
        <Button variant="secondary" size="sm" icon="plus" type="submit">
          Add tag
        </Button>
      </form>
      {confirmDialog}
    </section>
  );
}
