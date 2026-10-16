'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClientResponseError } from 'pocketbase';

import { Button, Icon } from '@/components/lort';
import { RequestView } from '@/components/request/request-view';
import { deleteComment, postComment } from '@/components/request/post-comment';
import { userPb } from '@/lib/pb';
import { keys, useRequest } from '@/lib/queries';
import { useUser } from '@/lib/session';
import { useAuth } from './auth';
import { useBrand } from './brand';
import { RequestSkeleton } from './skeletons';
import { PoweredBy } from './top-bar';
import { useVoteAction } from './vote';

export function RequestPage({ id }: { id: string }) {
  const brand = useBrand();
  const user = useUser();
  const { requireUser } = useAuth();
  const qc = useQueryClient();
  const vote = useVoteAction();
  const request = useRequest('board', id);

  // Signing in or out changes what this page may show (votes, own hidden requests, internal notes).
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: keys.request('board', id) });
  }, [user?.id, id, qc]);

  useEffect(() => {
    if (request.data) document.title = `${request.data.title} · ${brand.appName}`;
  }, [request.data, brand.appName]);

  return (
    <main className="lt-page lt-page-narrow">
      <Link href="/feedback" className="lt-back">
        <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
          <Icon name="arrowUp" size={16} />
        </span>
        All ideas
      </Link>
      {request.isPending ? (
        <RequestSkeleton />
      ) : request.isError ? (
        <div className="lt-empty" role="alert">
          <span className="lt-empty-dot" aria-hidden="true" />
          {request.error instanceof ClientResponseError && request.error.status === 404 ? (
            <>
              <p className="title" style={{ margin: 0 }}>
                This idea isn’t here
              </p>
              <p style={{ color: 'var(--ink-2)', margin: 0 }}>
                It may have been removed, or it’s waiting for the team to approve it.
              </p>
            </>
          ) : (
            <>
              <p className="title" style={{ margin: 0 }}>
                This idea didn’t load
              </p>
              <Button variant="secondary" onClick={() => request.refetch()}>
                Try again
              </Button>
            </>
          )}
        </div>
      ) : (
        <RequestView
          detail={request.data}
          scope="board"
          onVote={() => vote(id)}
          canUseInternal={!!user?.isAdmin}
          voiceEnabled={brand.features.voice}
          placeholder={`Add a comment for ${request.data.author.name || 'them'} and the ${brand.appName} team…`}
          onSignIn={() => void requireUser('signin')}
          viewerId={user?.id}
          canDelete={(c) => !!user && c.author.id === user.id}
          onDeleteComment={async (c) => {
            await deleteComment(userPb, c.id);
            await qc.invalidateQueries({ queryKey: keys.request('board', id) });
            void qc.invalidateQueries({ queryKey: ['feed'] });
          }}
          onComment={
            user
              ? async (input) => {
                  await postComment(userPb, id, input);
                  await qc.invalidateQueries({ queryKey: keys.request('board', id) });
                  void qc.invalidateQueries({ queryKey: ['feed'] });
                }
              : null
          }
        />
      )}
      <PoweredBy />
    </main>
  );
}
