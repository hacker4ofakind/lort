'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, StatusIcon } from '@/components/lort';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { adminPb } from '@/lib/pb';
import { useToast } from '@/lib/toast';
import type { Detail, Page } from '@/lib/types';

/** Merge: pick the request this one duplicates. Its voters move there. */
export function MergeDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: Detail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results =
    useQuery({
      queryKey: ['merge-search', debounced],
      queryFn: () =>
        adminPb.send<Page>('/api/lort/requests', {
          query: { q: debounced, perPage: 8, sort: debounced ? 'top' : 'newest' },
        }),
      enabled: open,
    }).data?.items.filter((it) => it.id !== detail.id) ?? [];

  const merge = async (targetId: string, title: string) => {
    setBusy(true);
    try {
      await adminPb.send(`/api/lort/requests/${detail.id}/merge`, { method: 'POST', body: { target: targetId } });
      void qc.invalidateQueries({ queryKey: ['feed', 'team'] });
      void qc.invalidateQueries({ queryKey: ['request', 'team'] });
      toast({ message: `Merged into “${title}”` });
      onOpenChange(false);
      router.push(`/dashboard/requests/${targetId}`);
    } catch (err) {
      toast({ message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="lt-dialog max-w-[560px] gap-4 sm:max-w-[560px]">
        <DialogTitle className="title">Merge into another request</DialogTitle>
        <DialogDescription style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14 }}>
          “{detail.title}” closes and points there. Its {detail.votes}{' '}
          {detail.votes === 1 ? 'vote moves' : 'votes move'} over.
        </DialogDescription>
        <Command shouldFilter={false} className="lt-pop" style={{ boxShadow: 'none' }}>
          <CommandInput placeholder="Search requests" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>No other requests match.</CommandEmpty>
            {results.map((it) => (
              <CommandItem
                key={it.id}
                value={it.id}
                disabled={busy}
                onSelect={() => merge(it.id, it.title)}
                className="lt-pop-row"
              >
                <StatusIcon status={it.status} size={16} />
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {it.title}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.votes} votes</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Edit a request's title and details. */
export function EditDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: Detail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [title, setTitle] = useState(detail.title);
  const [body, setBody] = useState(detail.body);
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const toast = useToast();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await adminPb.collection('requests').update(detail.id, { title: title.trim(), body });
      void qc.invalidateQueries({ queryKey: ['request', 'team'] });
      void qc.invalidateQueries({ queryKey: ['feed', 'team'] });
      toast({ message: 'Saved' });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setTitle(detail.title);
          setBody(detail.body);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent showCloseButton={false} className="lt-dialog max-w-[640px] sm:max-w-[640px]">
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <DialogTitle className="title">Edit request</DialogTitle>
          <div>
            <label className="lt-label" htmlFor="edit-title">
              Title
            </label>
            <input
              id="edit-title"
              className="lt-field lt-field-title"
              required
              minLength={3}
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="lt-label" htmlFor="edit-body">
              Details
            </label>
            <textarea
              id="edit-body"
              className="lt-field"
              style={{ height: 160, padding: '12px 16px', borderRadius: 14, lineHeight: '23px' }}
              maxLength={10000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {error && (
            <p className="lt-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Delete, after a confirmation that says what goes with it. */
export function DeleteDialog({
  detail,
  open,
  onOpenChange,
  back,
}: {
  detail: Detail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  back: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const remove = async () => {
    try {
      await adminPb.collection('requests').delete(detail.id);
      void qc.invalidateQueries({ queryKey: ['feed', 'team'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      toast({ message: 'Request deleted' });
      router.push(back);
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="lt-dialog max-w-[460px] sm:max-w-[460px]">
        <DialogTitle className="title">Delete this request?</DialogTitle>
        <DialogDescription style={{ margin: 0, color: 'var(--ink-2)' }}>
          “{detail.title}”, its {detail.votes} votes and {detail.comments} comments go for good. Closing it keeps them
          instead.
        </DialogDescription>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
