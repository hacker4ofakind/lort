'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { IconArrowsExchange } from '@tabler/icons-react';

import {
  Avatar,
  Button,
  Chip,
  Composer,
  Icon,
  InternalNote,
  STATUS,
  StatusIcon,
  VoteSticker,
  type ComposerSubmit,
  type Status,
} from '@/components/lort';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { avatarUrl, fileUrl } from '@/lib/pb';
import { pbFor, type Scope } from '@/lib/queries';
import { shortDate, timeAgo } from '@/lib/time';
import { useToast } from '@/lib/toast';
import type { Activity, Comment, Detail, Person } from '@/lib/types';

export interface CommentInput extends ComposerSubmit {
  parent?: string;
}

interface Props {
  detail: Detail;
  scope: Scope;
  /** Board: a working sticker. Dashboard: the count, read-only. */
  onVote?: () => void;
  /** Replaces the read-only status/board/tag chips (the dashboard passes editable ones). */
  chips?: ReactNode;
  /** Wraps a person's avatar (the dashboard adds the moderation popover). */
  renderAvatar?: (person: Person, avatar: ReactNode) => ReactNode;
  /** Null when signed out: a sign-in prompt shows instead of the composer. */
  onComment: ((input: CommentInput) => Promise<void>) | null;
  onSignIn?: () => void;
  canUseInternal?: boolean;
  voiceEnabled?: boolean;
  placeholder: string;
  /** Whether the viewer may delete a comment (its author on the board; anyone on the dashboard). */
  canDelete?: (c: Comment) => boolean;
  /** Deletes a comment (and, for a top-level one, its replies). Throws a friendly Error on failure. */
  onDeleteComment?: (c: Comment) => Promise<void>;
  /** The signed-in viewer's profile id, to word the delete button for their own comments. */
  viewerId?: string;
}

type Entry = { at: string; activity?: Activity; comment?: Comment };

/** A request page: header, body, chips, composer and the timeline (newest first). */
export function RequestView(props: Props) {
  const { detail: d, scope, onVote, chips, onComment, onSignIn, canUseInternal, voiceEnabled, placeholder } = props;
  const avatar = props.renderAvatar ?? ((_p: Person, node: ReactNode) => node);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);

  // Images are protected files: a hidden request's, and an internal note's on any request.
  // Those need a file token for the viewer.
  const notesWithImages = d.thread.some((c) => c.internal && c.images.length > 0);
  const token = useQuery({
    queryKey: ['file-token', scope],
    queryFn: () => pbFor(scope).files.getToken(),
    enabled: !d.visible || notesWithImages,
    staleTime: 60_000,
  }).data;
  const image = (collection: string, id: string, name: string, internal = false) =>
    fileUrl(collection, id, name, d.visible && !internal ? undefined : token);

  const entries: Entry[] = [
    ...d.activity.map((a) => ({ at: a.created, activity: a })),
    ...d.thread.map((c) => ({ at: c.created, comment: c })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const closed = d.status === 'closed' || !!d.mergedInto;

  return (
    <article>
      {d.mergedInto && (
        <p className="lt-banner" style={{ marginBottom: 20 }}>
          <Icon name="merge" size={18} />
          <span>
            Merged into{' '}
            <Link
              className="lt-link"
              href={`${scope === 'team' ? '/dashboard/requests' : '/feedback'}/${d.mergedInto.id}`}
            >
              {d.mergedInto.name}
            </Link>
            . Votes moved there too.
          </span>
        </p>
      )}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="display-l" style={{ margin: 0, textWrap: 'balance', overflowWrap: 'anywhere' }}>
            {d.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 14 }}>
            {avatar(
              d.author,
              <Avatar name={d.author.name || '?'} src={avatarUrl(d.author)} size={32} keyline team={d.author.team} />,
            )}
            <b>{d.author.name || 'Deleted account'}</b>
            <span style={{ color: 'var(--muted)' }}>· {timeAgo(d.created)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <VoteSticker
            count={d.votes}
            voted={d.voted}
            subject={d.title}
            readOnly={!onVote || closed}
            onVotedChange={onVote}
          />
          {onVote && !closed && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              {d.voted ? 'Your dot' : 'Stick a dot'}
            </span>
          )}
        </div>
      </div>

      {d.body && (
        <p className="body lt-prose" style={{ margin: '20px 0 0', color: 'var(--ink-2)', maxWidth: '68ch' }}>
          {d.body}
        </p>
      )}
      {d.images.length > 0 && (
        <div className="lt-images">
          {d.images.map((name) => (
            <a key={name} href={image('requests', d.id, name)} target="_blank" rel="noreferrer">
              <img src={image('requests', d.id, name)} alt="Attached screenshot" />
            </a>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
        {chips ?? (
          <>
            <Chip kind="status" status={d.status} interactive={false} />
            <Chip kind="board" label={d.board.name} interactive={false} />
            {d.tags.map((t) => (
              <Chip key={t.id} kind="tag" label={t.name} interactive={false} />
            ))}
            {d.awaitingApproval && (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Waiting for approval. Only you and the team can see it.
              </span>
            )}
          </>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '30px 0 24px' }} />

      <h2 className="title" style={{ margin: '0 0 14px' }}>
        {d.comments === 1 ? '1 comment' : `${d.comments} comments`}
      </h2>
      {onComment ? (
        <Composer
          placeholder={placeholder}
          allowImages
          voiceEnabled={voiceEnabled}
          canUseInternal={canUseInternal}
          onSubmit={(v) => onComment(v)}
        />
      ) : (
        <div className="lt-banner">
          <span style={{ flex: 1 }}>Sign in to join the conversation.</span>
          <Button variant="secondary" size="sm" onClick={onSignIn}>
            Sign in
          </Button>
        </div>
      )}

      <section aria-label="Activity" style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {entries.map((e) =>
          e.activity ? (
            <ActivityLine key={e.activity.id} a={e.activity} board={d.board.name} />
          ) : (
            <CommentBlock
              key={e.comment!.id}
              c={e.comment!}
              avatar={avatar}
              image={(name, x) => image('comments', x.id, name, x.internal)}
              deleteLabel={props.onDeleteComment ? (x) => deleteLabel(x, props.viewerId) : undefined}
              canDelete={props.canDelete ?? (() => false)}
              onDelete={setDeleting}
              replying={replyTo === e.comment!.id}
              onReply={onComment ? () => setReplyTo(replyTo === e.comment!.id ? null : e.comment!.id) : undefined}
              reply={
                onComment && replyTo === e.comment!.id ? (
                  <Composer
                    placeholder={`Reply to ${e.comment!.author.name}…`}
                    allowImages
                    voiceEnabled={voiceEnabled}
                    onSubmit={async (v) => {
                      await onComment({ ...v, visibility: 'public', parent: e.comment!.id });
                      setReplyTo(null);
                    }}
                  />
                ) : null
              }
            />
          ),
        )}
      </section>
      {props.onDeleteComment && (
        <DeleteCommentDialog comment={deleting} onClose={() => setDeleting(null)} onDelete={props.onDeleteComment} />
      )}
    </article>
  );
}

const excerpt = (text: string) => (text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text);

function deleteLabel(c: Comment, viewerId?: string) {
  const whose = c.author.id && c.author.id === viewerId ? 'your comment' : `${c.author.name || 'this'}’s comment`;
  return `Delete ${whose} “${excerpt(c.body)}”`;
}

/** Confirms a delete and says what goes with it: a top-level comment takes its replies along. */
function DeleteCommentDialog({
  comment,
  onClose,
  onDelete,
}: {
  comment: Comment | null;
  onClose: () => void;
  onDelete: (c: Comment) => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const replies = comment?.replies.length ?? 0;
  const remove = async () => {
    if (!comment) return;
    setBusy(true);
    try {
      await onDelete(comment);
      toast({ message: 'Comment deleted' });
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error && err.message ? err.message : errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={comment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="lt-dialog max-w-[440px] sm:max-w-[440px]">
        <DialogTitle className="title">{comment?.internal ? 'Delete this note?' : 'Delete this comment?'}</DialogTitle>
        <DialogDescription style={{ margin: 0, color: 'var(--ink-2)' }}>
          {replies > 0
            ? `It goes for good, along with its ${replies === 1 ? 'reply' : `${replies} replies`}.`
            : 'It goes for good.'}
        </DialogDescription>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" disabled={busy} onClick={remove}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActivityLine({ a, board }: { a: Activity; board: string }) {
  const who = <b style={{ color: 'var(--ink)' }}>{a.actor.name || 'Someone'}</b>;
  const line = (icon: ReactNode, text: ReactNode) => (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'var(--muted)', paddingLeft: 4 }}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
  switch (a.kind) {
    case 'created':
      return line(
        <StatusIcon status="pending" keyline size={20} />,
        <>
          {who} posted this in {board} · {shortDate(a.created)}
        </>,
      );
    case 'status_changed':
      return line(
        <StatusIcon status={a.to as Status} keyline size={20} />,
        <>
          {who}
          {a.actor.team ? ' from the team' : ''} moved this to{' '}
          <b style={{ color: 'var(--ink)' }}>{STATUS[a.to as Status]?.label ?? a.to}</b> · {timeAgo(a.created)}
        </>,
      );
    case 'board_changed':
      return line(
        <IconArrowsExchange size={20} stroke={2} />,
        <>
          {who} moved this from {a.from || 'another board'} to {a.to} · {timeAgo(a.created)}
        </>,
      );
    case 'merged_from':
      return line(
        <Icon name="merge" size={20} />,
        <>
          {who} merged a duplicate into this · {timeAgo(a.created)}
        </>,
      );
    case 'merged_in':
      return line(
        <Icon name="merge" size={20} />,
        <>
          {who} merged this into another request · {timeAgo(a.created)}
        </>,
      );
  }
}

function CommentBlock({
  c,
  avatar,
  image,
  deleteLabel,
  canDelete,
  onDelete,
  onReply,
  replying,
  reply,
}: {
  c: Comment;
  avatar: (p: Person, node: ReactNode) => ReactNode;
  image: (name: string, comment: Comment) => string;
  /** Set when deleting is possible here; names the comment for screen readers. */
  deleteLabel?: (c: Comment) => string;
  canDelete: (c: Comment) => boolean;
  onDelete: (c: Comment) => void;
  onReply?: () => void;
  replying: boolean;
  reply: ReactNode;
}) {
  const remove = (x: Comment) =>
    deleteLabel &&
    canDelete(x) && (
      <button className="lt-text-button" aria-label={deleteLabel(x)} onClick={() => onDelete(x)}>
        Delete
      </button>
    );
  const head = (x: Comment) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
      {avatar(
        x.author,
        <Avatar name={x.author.name || '?'} src={avatarUrl(x.author)} size={26} team={x.author.team} />,
      )}
      <b>{x.author.name || 'Deleted account'}</b>
      {x.author.team && <span className="lt-team-badge">Team</span>}
      <span style={{ color: 'var(--muted)' }}>· {timeAgo(x.created)}</span>
    </div>
  );
  const images = (x: Comment, indent = 34) =>
    x.images.length > 0 && (
      <div className="lt-images" style={{ marginLeft: indent }}>
        {x.images.map((n) => (
          <a key={n} href={image(n, x)} target="_blank" rel="noreferrer">
            <img src={image(n, x)} alt="Attached screenshot" />
          </a>
        ))}
      </div>
    );

  if (c.internal) {
    return (
      <InternalNote author={c.author.name} time={timeAgo(c.created)}>
        <span className="lt-prose">{c.body}</span>
        {images(c, 0)}
        {remove(c) && <div style={{ marginTop: 6 }}>{remove(c)}</div>}
      </InternalNote>
    );
  }
  return (
    <div style={{ padding: '0 4px' }}>
      {head(c)}
      <p className="body lt-prose" style={{ margin: '6px 0 0 34px', color: 'var(--ink-2)' }}>
        {c.body}
      </p>
      {images(c)}
      {(onReply || remove(c)) && (
        <div style={{ margin: '4px 0 0 34px', display: 'flex', gap: 16 }}>
          {onReply && (
            <button className="lt-text-button" aria-expanded={replying} onClick={onReply}>
              Reply
            </button>
          )}
          {remove(c)}
        </div>
      )}
      {c.replies.map((r) => (
        <div key={r.id} className="lt-reply">
          {head(r)}
          <p className="body lt-prose" style={{ margin: '6px 0 0 34px', color: 'var(--ink-2)' }}>
            {r.body}
          </p>
          {images(r)}
          {remove(r) && <div style={{ margin: '4px 0 0 34px' }}>{remove(r)}</div>}
        </div>
      ))}
      {reply && <div style={{ margin: '12px 0 0 34px' }}>{reply}</div>}
    </div>
  );
}
