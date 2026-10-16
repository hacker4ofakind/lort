import type { RequestSummary } from '@/components/lort';
import { avatarUrl } from '@/lib/pb';
import type { Item } from '@/lib/types';

/** An API item as the RequestCard expects it. */
export function toSummary(it: Item): RequestSummary {
  return {
    title: it.title,
    body: it.body,
    status: it.status,
    board: it.board.name,
    author: { name: it.author.name || 'Deleted account', avatarUrl: avatarUrl(it.author) },
    comments: it.comments,
    votes: it.votes,
    voted: it.voted,
    awaitingApproval: it.awaitingApproval,
  };
}
