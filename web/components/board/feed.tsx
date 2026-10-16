'use client';

import { useEffect, useRef, useState } from 'react';

import { Button, FloatingBar, RequestCard } from '@/components/lort';
import { listParam, useUrlState } from '@/lib/url-state';
import { useConfig, useFeed, useLiveRequests } from '@/lib/queries';
import { useMedia } from '@/lib/use-media';
import { useAuth } from './auth';
import { FilterSheet } from './filter-sheet';
import { FeedSkeleton } from './skeletons';
import { SuggestDialog } from './suggest-dialog';
import { toSummary } from './summary';
import { useVoteAction } from './vote';

export const OPEN = ['pending', 'reviewing', 'planned', 'progress'];

/** The board: request cards, the floating bar, and the Suggest dialog. */
export function Feed() {
  const { params, set } = useUrlState();
  const sort = params.get('sort') ?? 'trending';
  const status = listParam(params, 'status', OPEN);
  const board = listParam(params, 'board');
  const q = params.get('q') ?? '';
  const filtered = params.has('status') || board.length > 0 || q !== '';

  const boards = useConfig().data?.boards ?? [];
  const { live, fresh } = useLiveRequests('board');
  const feed = useFeed('board', { sort, status, board, q }, live);
  const vote = useVoteAction();
  const { requireUser } = useAuth();
  const compact = useMedia('(max-width: 640px)');
  const [suggesting, setSuggesting] = useState(false);
  const [filtering, setFiltering] = useState(false);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [feed]);

  const suggest = async () => {
    if (await requireUser()) setSuggesting(true);
  };

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      {feed.isPending ? (
        <FeedSkeleton />
      ) : feed.isError ? (
        <div className="lt-empty" role="alert">
          <p className="title">The ideas didn’t load</p>
          <p style={{ color: 'var(--ink-2)', margin: 0 }}>Check your connection, then try again.</p>
          <Button variant="secondary" onClick={() => feed.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="lt-empty">
          <span className="lt-empty-dot" aria-hidden="true" />
          {filtered ? (
            <>
              <p className="title" style={{ margin: 0 }}>
                Nothing matches
              </p>
              <p style={{ color: 'var(--ink-2)', margin: 0 }}>Try another search, or clear the filters.</p>
              <Button variant="secondary" onClick={() => set({ status: null, board: null, q: null })}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <p className="title" style={{ margin: 0 }}>
                No ideas yet
              </p>
              <p style={{ color: 'var(--ink-2)', margin: 0 }}>Be the first to stick one on the wall.</p>
              <Button variant="primary" icon="plus" onClick={suggest}>
                Suggest something
              </Button>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((it) => (
            <RequestCard
              key={it.id}
              request={toSummary(it)}
              href={`/feedback/${it.id}`}
              className={fresh.has(it.id) ? 'is-new' : undefined}
              onVotedChange={() => vote(it.id)}
            />
          ))}
          <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
          {feed.isFetchingNextPage && <FeedSkeleton />}
        </div>
      )}

      <div className="lt-floating">
        <FloatingBar
          compact={compact}
          boards={boards.map((b) => ({ value: b.id, label: b.name }))}
          sort={sort}
          onSortChange={(s) => set({ sort: s === 'trending' ? null : s })}
          selectedBoards={board.length ? board : boards.map((b) => b.id)}
          onSelectedBoardsChange={(v) => set({ board: v.length === boards.length ? null : v })}
          selectedStatuses={status}
          onSelectedStatusesChange={(v) => set({ status: v.length === 0 || sameSet(v, OPEN) ? null : v })}
          onSuggest={suggest}
          onOpenFilters={() => setFiltering(true)}
        />
      </div>
      <FilterSheet
        open={filtering}
        onOpenChange={setFiltering}
        boards={boards}
        board={board}
        status={status}
        onChange={(patch) =>
          set({
            ...(patch.board && { board: patch.board.length === boards.length ? null : patch.board }),
            ...(patch.status && {
              status: patch.status.length === 0 || sameSet(patch.status, OPEN) ? null : patch.status,
            }),
          })
        }
      />
      <SuggestDialog open={suggesting} onOpenChange={setSuggesting} />
    </>
  );
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}
