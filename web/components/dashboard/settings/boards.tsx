'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import { Button } from '@/components/lort';
import { errorMessage } from '@/lib/errors';
import { adminPb } from '@/lib/pb';
import { useAllBoards } from '@/lib/team-queries';
import { useToast } from '@/lib/toast';
import { useConfirm } from './confirm';
import { orderChanges, SortableRows } from './sortable-rows';
import { Toggle } from './toggle';

export function BoardsSection() {
  const boards = useAllBoards().data;
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
      void qc.invalidateQueries({ queryKey: ['boards'] });
      void qc.invalidateQueries({ queryKey: ['config'] });
    }
  };

  const reorder = (items: RecordModel[]) => {
    qc.setQueryData(['boards'], items);
    void run(() =>
      Promise.all(orderChanges(items).map((c) => adminPb.collection('boards').update(c.id, { order: c.order }))),
    );
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    setAdding('');
    void run(
      () => adminPb.collection('boards').create({ name, isPublic: true, order: boards?.length ?? 0 }),
      `Added ${name}`,
    );
  };

  return (
    <section className="sec" id="boards">
      <h2>Boards</h2>
      <p className="lede">
        Drag to reorder. The top board is the default for new suggestions. Private boards are only visible to your team.
      </p>
      <div className="set-grid" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', paddingBottom: 6 }}>
        <span />
        <span>Board</span>
        <span>Public</span>
        <span>Needs approval</span>
        <span />
      </div>
      {!boards ? (
        <div className="sk" style={{ height: 96, borderRadius: 12 }} />
      ) : (
        <SortableRows items={boards} label={(b) => b.name} onReorder={reorder}>
          {(b, grip, i) => (
            <div className="set-grid" style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              {grip}
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <input
                  className="set-field"
                  aria-label="Board name"
                  defaultValue={b.name}
                  maxLength={60}
                  style={{ width: '100%', maxWidth: 240, fontWeight: 600 }}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== b.name)
                      void run(() => adminPb.collection('boards').update(b.id, { name }), 'Renamed');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                {i === 0 && <span className="badge">Default</span>}
              </span>
              <Toggle
                label={`${b.name} is public`}
                checked={b.isPublic}
                onChange={(on) => void run(() => adminPb.collection('boards').update(b.id, { isPublic: on }))}
              />
              <Toggle
                label={`${b.name} needs approval`}
                checked={b.requireApproval}
                onChange={(on) => void run(() => adminPb.collection('boards').update(b.id, { requireApproval: on }))}
              />
              <Button
                variant="ghost"
                size="sm"
                icon="x"
                iconOnly
                aria-label={`Delete ${b.name}`}
                onClick={() =>
                  confirm({
                    title: `Delete ${b.name}?`,
                    description: 'Only an empty board can go. Move its requests to another board first.',
                    action: 'Delete',
                    onConfirm: () => run(() => adminPb.collection('boards').delete(b.id), `Deleted ${b.name}`),
                  })
                }
              />
            </div>
          )}
        </SortableRows>
      )}
      <form onSubmit={add} style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <input
          className="set-field"
          aria-label="New board name"
          placeholder="New board name"
          value={adding}
          maxLength={60}
          onChange={(e) => setAdding(e.target.value)}
        />
        <Button variant="secondary" size="sm" icon="plus" type="submit">
          Add board
        </Button>
      </form>
      {confirmDialog}
    </section>
  );
}
