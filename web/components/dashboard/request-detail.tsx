'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconDots } from '@tabler/icons-react';

import { Chip, Icon, STATUS, StatusIcon, TriageBar, triageActions, type TriageAction } from '@/components/lort';
import { useBrand } from '@/components/board/brand';
import { RequestSkeleton } from '@/components/board/skeletons';
import { RequestView } from '@/components/request/request-view';
import { deleteComment, postComment } from '@/components/request/post-comment';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { errorMessage } from '@/lib/errors';
import { adminPb, userPb } from '@/lib/pb';
import { keys, useFeed, useRequest } from '@/lib/queries';
import { useAllBoards, useTags } from '@/lib/team-queries';
import { useToast } from '@/lib/toast';
import { useUser } from '@/lib/session';
import { listParam } from '@/lib/url-state';
import { ChipButton } from './chip-button';
import { PersonPopover } from './person-popover';
import { DeleteDialog, EditDialog, MergeDialog } from './request-dialogs';
import { useTriage } from './triage';

const OPEN = ['pending', 'reviewing', 'planned', 'progress'];

/** /dashboard/requests/<id> (design/canvas/D-Request.dc.html). The URL keeps the table's filters, which make the queue. */
export function RequestDetail({ id }: { id: string }) {
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const profile = useUser();
  const request = useRequest('team', id);
  const d = request.data;
  const triage = useTriage(d);
  const boards = useAllBoards().data ?? [];
  const tags = useTags().data ?? [];
  const [merging, setMerging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The queue is the table this page was opened from, with the same filters and sort.
  const queueFilters = {
    sort: params.get('sort') ?? 'newest',
    status: listParam(params, 'status', OPEN),
    board: listParam(params, 'board'),
    tag: listParam(params, 'tag'),
    visibility: params.get('visibility') ?? '',
    q: params.get('q') ?? '',
  };
  const queue = useFeed('team', queueFilters);
  const ids = queue.data?.pages.flatMap((p) => p.items.map((it) => it.id)) ?? [];
  const position = ids.indexOf(id);
  const total = queue.data?.pages[0]?.totalItems ?? 0;
  const search = params.toString() ? `?${params.toString()}` : '';
  const back = `/dashboard/requests${search}`;

  useEffect(() => {
    if (!d?.new) return;
    adminPb
      .send(`/api/lort/requests/${id}/seen`, { method: 'POST' })
      .then(() => {
        void qc.invalidateQueries({ queryKey: keys.stats });
        void qc.invalidateQueries({ queryKey: ['feed', 'team'] });
      })
      .catch(() => {});
  }, [d?.new, id, qc]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.request('team', id) });
    void qc.invalidateQueries({ queryKey: ['feed', 'team'] });
  };

  const skip = async () => {
    let next: string | undefined = ids[position + 1];
    if (!next && queue.hasNextPage) {
      const res = await queue.fetchNextPage();
      next = res.data?.pages.flatMap((p) => p.items.map((it) => it.id))[position + 1];
    }
    if (next) router.push(`/dashboard/requests/${next}${search}`);
    else toast({ message: 'That was the last one in this list' });
  };

  const onAction = (a: TriageAction) => {
    if (a.id === 'merge') setMerging(true);
    else if (a.id === 'skip') void skip();
    else void triage(a);
  };

  const update = async (data: Record<string, unknown>, done: string) => {
    try {
      await adminPb.collection('requests').update(id, data);
      refresh();
      toast({ message: done });
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };

  const moveBoard = async (boardId: string, name: string) => {
    try {
      await adminPb.send(`/api/lort/requests/${id}/board`, { method: 'POST', body: { board: boardId } });
      refresh();
      toast({ message: `Moved to ${name}` });
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };

  const statusLabel = queueFilters.status.length === 1 ? queueFilters.status[0] : '';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <nav
        aria-label="Breadcrumb"
        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--muted)', marginBottom: 22 }}
      >
        <Link href={back} className="lt-text-button" style={{ fontSize: 14 }}>
          Requests
        </Link>
        <span>/</span>
        {d ? <span>{d.board.name}</span> : <span className="sk" style={{ width: 48, height: 12 }} />}
        <span style={{ flex: 1 }} />
        {position >= 0 && (
          <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {position + 1} of {total}
            {statusLabel && (
              <>
                {' '}
                in <StatusIcon status={statusLabel as never} showLabel size={14} />
              </>
            )}
          </span>
        )}
        {d && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="lt-btn lt-btn-ghost lt-btn-icon lt-btn-sm" aria-label="More actions">
                <IconDots size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="lt-pop">
              <DropdownMenuItem className="lt-pop-row" onSelect={() => setEditing(true)}>
                Edit title and details
              </DropdownMenuItem>
              <DropdownMenuItem className="lt-pop-row" asChild>
                <a href={`/feedback/${id}`} target="_blank" rel="noreferrer">
                  View on the board
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem className="lt-pop-row is-danger" onSelect={() => setDeleting(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>

      {request.isPending ? (
        <RequestSkeleton />
      ) : request.isError || !d ? (
        <div className="lt-empty" role="alert">
          <p className="title" style={{ margin: 0 }}>
            This request is gone
          </p>
          <Link href={back} className="lt-link">
            Back to requests
          </Link>
        </div>
      ) : (
        <>
          <RequestView
            detail={d}
            scope="team"
            canUseInternal
            voiceEnabled={brand.features.voice}
            placeholder={`Reply to ${d.author.name || 'them'}, or leave a note for the team…`}
            renderAvatar={(person, avatar) => <PersonPopover person={person}>{avatar}</PersonPopover>}
            onComment={async (input) => {
              await postComment(userPb, id, input);
              refresh();
            }}
            // The team can delete any comment, through the dashboard's superuser session.
            viewerId={profile?.id}
            canDelete={() => true}
            onDeleteComment={async (c) => {
              await deleteComment(adminPb, c.id);
              refresh();
            }}
            chips={
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <ChipButton kind="status" aria-label={`Status: ${STATUS[d.status].label}. Change it`}>
                      <StatusIcon status={d.status} keyline showLabel size={18} />
                    </ChipButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="lt-pop">
                    {triageActions(d.status)
                      .filter((a) => a.next)
                      .map((a) => (
                        <DropdownMenuItem key={a.id} className="lt-pop-row" onSelect={() => void triage(a)}>
                          <StatusIcon status={a.next!} size={16} />
                          {a.label}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <ChipButton kind="board" aria-label={`Board: ${d.board.name}. Move it`}>
                      {d.board.name}
                    </ChipButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="lt-pop">
                    {boards.map((b) => (
                      <DropdownMenuItem
                        key={b.id}
                        className="lt-pop-row"
                        aria-checked={b.id === d.board.id}
                        onSelect={() => b.id !== d.board.id && void moveBoard(b.id, b.name)}
                      >
                        {b.name}
                        {!b.isPublic && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> (private)</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {d.tags.map((t) => (
                  <DropdownMenu key={t.id}>
                    <DropdownMenuTrigger asChild>
                      <ChipButton kind="tag" aria-label={`Tag ${t.name}`}>
                        {t.name}
                      </ChipButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="lt-pop">
                      <DropdownMenuItem
                        className="lt-pop-row"
                        onSelect={() => void update({ 'tags-': [t.id] }, `Removed ${t.name}`)}
                      >
                        Remove {t.name}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
                {tags.some((t) => !d.tags.find((x) => x.id === t.id)) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <ChipButton kind="add" aria-label="Add a tag">
                        <Icon name="plus" size={16} />
                      </ChipButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="lt-pop">
                      {tags
                        .filter((t) => !d.tags.find((x) => x.id === t.id))
                        .map((t) => (
                          <DropdownMenuItem
                            key={t.id}
                            className="lt-pop-row"
                            onSelect={() => void update({ 'tags+': [t.id] }, `Tagged ${t.name}`)}
                          >
                            {t.name}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Chip
                  kind="switch"
                  label="On the board"
                  checked={d.visible}
                  onCheckedChange={(on) =>
                    void update(
                      on ? { visible: true, awaitingApproval: false } : { visible: false },
                      on ? 'Now on the board' : 'Hidden from the board',
                    )
                  }
                />
              </>
            }
          />
          <div className="lt-floating">
            <TriageBar status={d.status} onAction={onAction} />
          </div>
          <MergeDialog detail={d} open={merging} onOpenChange={setMerging} />
          <EditDialog detail={d} open={editing} onOpenChange={setEditing} />
          <DeleteDialog detail={d} open={deleting} onOpenChange={setDeleting} back={back} />
        </>
      )}
    </div>
  );
}
