'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar, Button } from '@/components/lort';
import { errorMessage } from '@/lib/errors';
import { adminPb } from '@/lib/pb';
import { useTeam } from '@/lib/team-queries';
import { useToast } from '@/lib/toast';
import { shortDate } from '@/lib/time';
import { useConfirm } from './confirm';

export function TeamSection() {
  const team = useTeam().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminPb.send<{ link: string }>('/api/lort/team/invite', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setLink(res.link);
      setEmail('');
      void qc.invalidateQueries({ queryKey: ['team'] });
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };

  const remove = async (id: string, who: string) => {
    try {
      await adminPb.send(`/api/lort/team/${id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['team'] });
      toast({ message: `${who} is no longer an admin` });
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };

  return (
    <section className="sec" id="team">
      <h2>Team</h2>
      <p className="lede">Admins can sign in to this dashboard. Their comments show a Team badge.</p>
      {!team ? (
        <div className="sk" style={{ height: 64, borderRadius: 12 }} />
      ) : (
        team.items.map((m, i) => (
          <div key={m.id} className="set-row">
            <Avatar name={m.name || m.email} size={32} team />
            <div className="set-row-main">
              <b>
                {m.name || m.email}
                {m.id === team.you && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    You
                  </span>
                )}
              </b>
              <span>
                {m.email} · {i === 0 ? 'set up Lort' : `invited ${shortDate(m.created)}`}
              </span>
            </div>
            {m.id !== team.you && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  confirm({
                    title: `Remove ${m.name || m.email}?`,
                    description: 'They can’t sign in to the dashboard any more. Their comments stay.',
                    action: 'Remove',
                    onConfirm: () => remove(m.id, m.name || m.email),
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
        ))
      )}
      <form
        onSubmit={invite}
        style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}
      >
        <input
          className="set-field"
          type="email"
          required
          aria-label="Email to invite"
          placeholder="name@yourapp.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: 260 }}
        />
        <Button variant="secondary" size="sm" icon="plus" type="submit">
          Invite an admin
        </Button>
      </form>
      {link && (
        <div className="lt-banner" style={{ marginTop: 12, flexWrap: 'wrap' }} role="status">
          <span style={{ flex: 1, minWidth: 200 }}>Send this link to them. It works for 7 days.</span>
          <code style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--ink-2)' }}>{link}</code>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void navigator.clipboard.writeText(link).then(() => toast({ message: 'Invite link copied' }))
            }
          >
            Copy
          </Button>
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
