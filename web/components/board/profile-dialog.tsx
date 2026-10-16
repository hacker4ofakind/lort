'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { Avatar, Button } from '@/components/lort';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { avatarUrl, userPb } from '@/lib/pb';
import { signOut, useUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

/** Name, picture and sign out. (Email notification switches arrive with email in phase 3.) */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useUser();
  const toast = useToast();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One object URL per picked picture, released when it changes or the dialog goes away.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : undefined), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  if (!user) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      data.set('name', name.trim() || user.name);
      if (file) data.set('avatar', file);
      const record = await userPb.collection('users').update(user.id, data);
      userPb.authStore.save(userPb.authStore.token, record);
      toast({ message: 'Profile saved' });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(user.name);
          setFile(null);
          setError('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} className="lt-dialog max-w-[420px] sm:max-w-[420px]">
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <DialogTitle className="title">Your profile</DialogTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar
              name={user.name || user.email}
              src={preview ?? avatarUrl({ id: user.id, avatar: user.avatar })}
              size={56}
              keyline
            />
            <label className="lt-text-button" style={{ color: 'var(--primary-text)' }}>
              Change picture
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div>
            <label className="lt-label" htmlFor="profile-name">
              Name
            </label>
            <input
              id="profile-name"
              className="lt-field"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="lt-hint">Shown next to your ideas and comments.</p>
          </div>
          {error && (
            <p className="lt-error" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                signOut();
                onOpenChange(false);
              }}
            >
              Sign out
            </Button>
            <span style={{ flex: 1 }} />
            <Button variant="primary" type="submit" disabled={busy}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
