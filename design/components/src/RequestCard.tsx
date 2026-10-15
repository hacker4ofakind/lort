import * as React from 'react';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { StatusIcon } from './StatusIcon';
import { VoteSticker } from './VoteSticker';
import { cx, type Status } from './utils';

export interface RequestSummary {
  title: string;
  body: string;
  status: Status;
  board: string;
  author: { name: string; avatarUrl?: string };
  comments: number;
  votes: number;
  voted: boolean;
  /** Hidden from the board until an admin approves it (only its author sees it). */
  awaitingApproval?: boolean;
}

export interface RequestCardProps {
  request: RequestSummary;
  /** Link to the request page, e.g. /feedback/abc123. */
  href: string;
  onVotedChange?: (voted: boolean) => void;
  className?: string;
}

/** One request in the public /feedback list: vote sticker, title, two-line excerpt, meta row. */
export function RequestCard({ request: r, href, onVotedChange, className }: RequestCardProps) {
  return (
    <article className={cx('lt-card', className)}>
      <VoteSticker
        count={r.votes}
        defaultVoted={onVotedChange ? undefined : r.voted}
        voted={onVotedChange ? r.voted : undefined}
        onVotedChange={onVotedChange}
        subject={r.title}
      />
      <div className="lt-card-main">
        <h2 className="lt-card-title">
          <a href={href} className="lt-card-link">
            {r.title}
          </a>
        </h2>
        <p className="lt-card-body">{r.body}</p>
        <div className="lt-meta">
          <StatusIcon status={r.status} keyline showLabel size={18} className="lt-meta-status" />
          <span className="lt-meta-pill">{r.board}</span>
          <span className="lt-meta-item">
            <Avatar name={r.author.name} src={r.author.avatarUrl} size={20} />
            {r.author.name}
          </span>
          <span className="lt-meta-item" aria-label={`${r.comments} comments`}>
            <Icon name="message" size={15} />
            {r.comments}
          </span>
          {r.awaitingApproval && <span className="lt-meta-item">Waiting for approval</span>}
        </div>
      </div>
    </article>
  );
}
