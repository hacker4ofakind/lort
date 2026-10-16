'use client';

import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Avatar } from '@/components/lort';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { errorMessage } from '@/lib/errors';
import { adminPb, avatarUrl } from '@/lib/pb';
import { useToast } from '@/lib/toast';
import { shortDate } from '@/lib/time';
import type { Person, UserSummary } from '@/lib/types';

/** Wraps a person's avatar with the moderation popover: who they are, reset link, ban. */
export function PersonPopover({ person, children }: { person: Person; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const summary = useQuery({
    queryKey: ['user', person.id],
    queryFn: () => adminPb.send<UserSummary>(`/api/lort/users/${person.id}`, {}),
    enabled: open && !!person.id,
  }).data;

  if (!person.id) return <>{children}</>;

  const copyReset = async () => {
    try {
      const { link } = await adminPb.send<{ link: string }>(`/api/lort/users/${person.id}/reset-link`, {
        method: 'POST',
      });
      await navigator.clipboard.writeText(link);
      toast({ message: `Reset link copied. Send it to ${person.name}.` });
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };

  const setBanned = async (banned: boolean) => {
    try {
      await adminPb.send(`/api/lort/users/${person.id}/ban`, { method: 'POST', body: { banned } });
      await qc.invalidateQueries({ queryKey: ['user', person.id] });
      toast({ message: banned ? `${person.name} can’t post or vote any more` : `${person.name} can post again` });
      setOpen(false);
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="lt-avatar-button" aria-label={`${person.name || 'This person'}, open member menu`}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="lt-pop w-[270px] p-3">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '2px 4px 10px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 6,
          }}
        >
          <Avatar name={person.name || '?'} src={avatarUrl(person)} size={36} team={person.team} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{person.name}</div>
            {summary ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {summary.email} · joined {shortDate(summary.joined)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {summary.requests} requests · {summary.votes} votes ·{' '}
                  {summary.verified ? 'verified email' : 'email not verified'}
                </div>
              </>
            ) : (
              <div className="sk" style={{ width: 160, height: 12, marginTop: 4 }} />
            )}
          </div>
        </div>
        {summary?.team ? (
          <p style={{ margin: '6px 10px', fontSize: 13, color: 'var(--muted)' }}>
            On the team. Manage admins in Settings → Team.
          </p>
        ) : (
          <>
            <button className="lt-pop-row" onClick={copyReset}>
              Copy password reset link
            </button>
            {summary?.banned ? (
              <button className="lt-pop-row" onClick={() => setBanned(false)}>
                Unban {person.name}
              </button>
            ) : (
              <button className="lt-pop-row is-danger" onClick={() => setBanned(true)}>
                Ban {person.name}
              </button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
