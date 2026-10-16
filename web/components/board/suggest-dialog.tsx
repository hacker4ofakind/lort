'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button, Composer, StatusIcon, VoteSticker, type ComposerSubmit } from '@/components/lort';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { userPb } from '@/lib/pb';
import { useConfig, useSimilar } from '@/lib/queries';
import { useUser } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { useBrand } from './brand';
import { useVoteAction } from './vote';

/** "Suggest something": board, title with look-alikes, tags, and the details composer that sends it all. */
interface SuggestProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Boards to offer; defaults to the public ones. The dashboard passes every board. */
  boards?: { id: string; name: string }[];
  /** Where to go once it's posted; defaults to its board page. */
  hrefFor?: (id: string) => string;
}

export function SuggestDialog({ open, onOpenChange, boards: only, hrefFor = (id) => `/feedback/${id}` }: SuggestProps) {
  const brand = useBrand();
  const user = useUser();
  const config = useConfig().data;
  const router = useRouter();
  const toast = useToast();
  const vote = useVoteAction();
  const qc = useQueryClient();
  const boards = only ?? config?.boards ?? [];
  const tags = config?.tags ?? [];
  const [pickedBoard, setBoard] = useState('');
  // The top board is the default until someone picks another.
  const board = boards.some((b) => b.id === pickedBoard) ? pickedBoard : (boards[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [titleError, setTitleError] = useState('');
  const [debounced, setDebounced] = useState('');
  const similar = useSimilar(debounced).data?.items ?? [];

  useEffect(() => {
    const t = setTimeout(() => setDebounced(title), 300);
    return () => clearTimeout(t);
  }, [title]);

  const submit = async ({ text, images, visibility }: ComposerSubmit) => {
    if (title.trim().length < 3) {
      setTitleError('Give your idea a short title.');
      throw new Error('Add a title first. Your details are still here.');
    }
    const data = new FormData();
    data.set('board', board);
    data.set('title', title.trim());
    data.set('body', text);
    picked.forEach((t) => data.append('tags', t));
    images.forEach((f) => data.append('images', f));
    data.set('internal', String(visibility === 'internal'));
    data.set('website', '');
    try {
      const created = await userPb.collection('requests').create(data);
      void qc.invalidateQueries({ queryKey: ['feed'] });
      onOpenChange(false);
      setTitle('');
      setPicked([]);
      toast({
        message: created.awaitingApproval
          ? 'Thanks! The team will check it before it shows on the board.'
          : 'Posted. Thanks for the idea!',
      });
      router.push(hrefFor(created.id));
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="lt-dialog top-[72px] max-h-[calc(100vh-96px)] max-w-[640px] translate-y-0 gap-5 overflow-y-auto sm:max-w-[640px]"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DialogTitle className="title" style={{ flex: 1 }}>
            Suggest something
          </DialogTitle>
          <Button variant="ghost" icon="x" iconOnly aria-label="Close" onClick={() => onOpenChange(false)} />
        </div>

        {boards.length > 1 && (
          <div>
            <span className="lt-label" id="sg-board">
              Board
            </span>
            <div role="radiogroup" aria-labelledby="sg-board" className="lt-segment">
              {boards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={board === b.id}
                  className="lt-segment-item"
                  onClick={() => setBoard(b.id)}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="lt-label" htmlFor="sg-title">
            Title
          </label>
          <input
            id="sg-title"
            className="lt-field lt-field-title"
            maxLength={140}
            placeholder={`What should ${brand.appName} do?`}
            value={title}
            aria-invalid={!!titleError}
            aria-describedby={titleError ? 'sg-title-error' : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError('');
            }}
          />
          {titleError && (
            <p className="lt-error" id="sg-title-error" role="alert">
              {titleError}
            </p>
          )}
          {similar.length > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-2)',
                ['--lt-si-ground' as string]: 'var(--surface-2)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>
                Is it one of these? A dot counts the same as a new post.
              </div>
              {similar.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                  <VoteSticker
                    count={s.votes}
                    voted={s.voted}
                    size="sm"
                    subject={s.title}
                    onVotedChange={() => vote(s.id)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 2,
                        fontSize: 13,
                        color: 'var(--muted)',
                      }}
                    >
                      <StatusIcon status={s.status} showLabel size={14} />· {s.board.name}
                    </div>
                  </div>
                  <a href={`/feedback/${s.id}`} className="lt-link" style={{ fontSize: 13 }}>
                    Open
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {tags.length > 0 && (
          <div>
            <span className="lt-label">
              Tags <span className="lt-label-note">(optional)</span>
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="lt-toggle-tag"
                  aria-pressed={picked.includes(t.id)}
                  onClick={() =>
                    setPicked(picked.includes(t.id) ? picked.filter((x) => x !== t.id) : [...picked, t.id])
                  }
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sg-compose">
          <span className="lt-label">Details</span>
          <Composer
            placeholder="What would it help you do? Screenshots welcome."
            allowImages
            voiceEnabled={brand.features.voice}
            canUseInternal={!!user?.isAdmin}
            onSubmit={submit}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
