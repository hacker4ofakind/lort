'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar, Button, cx, FilterMenu, Icon, StatusIcon, STATUS, STATUS_ORDER } from '@/components/lort';
import { SuggestDialog } from '@/components/board/suggest-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { avatarUrl } from '@/lib/pb';
import { useFeed, useLiveRequests } from '@/lib/queries';
import { useAllBoards, useStats, useTags } from '@/lib/team-queries';
import { shortDate } from '@/lib/time';
import { listParam, useUrlState } from '@/lib/url-state';

const OPEN = ['pending', 'reviewing', 'planned', 'progress'];
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'top', label: 'Most upvoted' },
  { value: 'updated', label: 'Recently updated' },
];

/** /dashboard/requests (design/canvas/D-Requests.dc.html). Filters live in the URL. */
export function RequestsTable() {
  const { params, set } = useUrlState();
  const sort = params.get('sort') ?? 'newest';
  const status = listParam(params, 'status', OPEN);
  const board = listParam(params, 'board');
  const tag = listParam(params, 'tag');
  const visibility = params.get('visibility') ?? '';
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const [suggesting, setSuggesting] = useState(false);
  const [cooling, setCooling] = useState(false);
  const qc = useQueryClient();

  const boards = useAllBoards().data ?? [];
  const tags = useTags().data ?? [];
  const stats = useStats().data;
  const { live, fresh } = useLiveRequests('team');
  const feed = useFeed('team', { sort, status, board, tag, visibility, q }, live);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const total = feed.data?.pages[0]?.totalItems ?? 0;

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) set({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, set]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [feed]);

  // Refreshing is limited to once every 10 seconds.
  const refresh = () => {
    setCooling(true);
    setTimeout(() => setCooling(false), 10_000);
    void qc.invalidateQueries({ queryKey: ['feed', 'team'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const queue = params.toString();

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="dash-h1">Requests</h1>
        {stats && (
          <span style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
            {stats.total} total · {stats.waiting} waiting for you
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{live ? 'Live' : 'Updates every 3 minutes'}</span>
        <Button variant="ghost" icon="rotate" iconOnly aria-label="Refresh" disabled={cooling} onClick={refresh} />
        <Button variant="primary" icon="plus" onClick={() => setSuggesting(true)}>
          New request
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 16px', flexWrap: 'wrap' }}>
        <label className="rq-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search titles and details"
            aria-label="Search requests"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <FilterMenu
          allLabel="Every status"
          noun="statuses"
          placement="down"
          options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS[s].label, icon: <StatusIcon status={s} /> }))}
          selected={status}
          onSelectedChange={(v) => set({ status: v.length === 0 || same(v, OPEN) ? null : v })}
          summarize={(v) => (same(v, OPEN) ? 'Open' : undefined)}
        />
        <FilterMenu
          allLabel="All boards"
          noun="boards"
          placement="down"
          options={boards.map((b) => ({ value: b.id, label: b.isPublic ? b.name : `${b.name} (private)` }))}
          selected={board}
          onSelectedChange={(v) => set({ board: v.length === boards.length ? null : v })}
        />
        {tags.length > 0 && (
          <FilterMenu
            allLabel="Any tag"
            noun="tags"
            placement="down"
            options={tags.map((t) => ({ value: t.id, label: t.name }))}
            selected={tag}
            onSelectedChange={(v) => set({ tag: v.length === tags.length ? null : v })}
          />
        )}
        <FilterMenu
          allLabel="Public and hidden"
          noun="kinds"
          placement="down"
          options={[
            { value: 'public', label: 'On the board' },
            { value: 'hidden', label: 'Hidden' },
          ]}
          selected={visibility ? [visibility] : []}
          onSelectedChange={(v) => set({ visibility: v.length === 1 ? v[0] : null })}
        />
        <span style={{ flex: 1 }} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" trailingIcon="chevronDown">
              {SORTS.find((s) => s.value === sort)?.label ?? 'Newest first'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="lt-pop">
            {SORTS.map((s) => (
              <DropdownMenuItem
                key={s.value}
                className="lt-pop-row"
                aria-checked={s.value === sort}
                onSelect={() => set({ sort: s.value === 'newest' ? null : s.value })}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div role="table" aria-label="Requests" className="rq-table" aria-busy={feed.isPending}>
        <div role="row" className="rq-row rq-head">
          <span role="columnheader">
            <span className="lt-sr">Status</span>
          </span>
          <span role="columnheader">Request</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>
            Votes
          </span>
          <span role="columnheader">Tags</span>
          <span role="columnheader">Date</span>
          <span role="columnheader">
            <span className="lt-sr">Requested by</span>
          </span>
        </div>
        {feed.isPending ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <div className="lt-empty">
            <span className="lt-empty-dot" aria-hidden="true" />
            <p className="title" style={{ margin: 0 }}>
              {params.size ? 'Nothing matches' : 'No requests yet'}
            </p>
            <p style={{ color: 'var(--ink-2)', margin: 0 }}>
              {params.size
                ? 'Try another search, or clear the filters.'
                : 'Share your board link and the ideas will start coming in.'}
            </p>
          </div>
        ) : (
          items.map((r) => (
            <Link
              role="row"
              key={r.id}
              href={`/dashboard/requests/${r.id}${queue ? `?${queue}` : ''}`}
              className={cx('rq-row', (r.new || fresh.has(r.id)) && 'is-new')}
            >
              <span role="cell">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span style={{ display: 'inline-flex' }}>
                      <StatusIcon status={r.status} size={18} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{STATUS[r.status].label}</TooltipContent>
                </Tooltip>
              </span>
              <span role="cell" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <span className="rq-title">{r.title}</span>
                {r.new && (
                  <span className="rq-badge" style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>
                    New
                  </span>
                )}
                {!r.visible && (
                  <span className="rq-badge" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>
                    Hidden
                  </span>
                )}
              </span>
              <span role="cell" className="rq-num">
                <Icon name="arrowUp" size={14} strokeWidth={2.6} />
                {r.votes}
              </span>
              <span role="cell" style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
                {r.tags.map((t) => (
                  <span key={t.id} className="rq-tag">
                    {t.name}
                  </span>
                ))}
              </span>
              <span role="cell" className="rq-date">
                {shortDate(r.created)}
              </span>
              <span role="cell" title={r.author.name}>
                <Avatar name={r.author.name || '?'} src={avatarUrl(r.author)} size={26} team={r.author.team} />
              </span>
            </Link>
          ))
        )}
        <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
      </div>
      {items.length > 0 && (
        <p style={{ margin: '14px 4px 0', fontSize: 13, color: 'var(--muted)' }}>
          Showing {items.length} of {total} requests{feed.hasNextPage ? '. Scroll for more.' : '.'}
        </p>
      )}
      <SuggestDialog
        open={suggesting}
        onOpenChange={setSuggesting}
        boards={boards.map((b) => ({ id: b.id, name: b.name }))}
        hrefFor={(id) => `/dashboard/requests/${id}`}
      />
    </div>
  );
}

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

const ROWS = ['52%', '68%', '41%', '59%', '74%', '47%', '63%', '55%', '38%', '70%'];

/** Loading rows (design/canvas/S-Requests.dc.html). */
function TableSkeleton() {
  return (
    <>
      {ROWS.map((w, i) => (
        <div key={i} className="rq-row">
          <div className="sk" style={{ width: 18, height: 18 }} />
          <div className="sk" style={{ width: w, height: 14 }} />
          <div className="sk" style={{ width: 34, height: 14, justifySelf: 'end' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="sk" style={{ width: i % 3 === 0 ? 64 : 48, height: 20 }} />
          </div>
          <div className="sk" style={{ width: 44, height: 12 }} />
          <div className="sk" style={{ width: 26, height: 26 }} />
        </div>
      ))}
    </>
  );
}
