'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Avatar, Button, cx, Icon } from '@/components/lort';
import { avatarUrl } from '@/lib/pb';
import { useUser } from '@/lib/session';
import { useAuth } from './auth';
import { BrandMark, useBrand } from './brand';
import { ProfileDialog } from './profile-dialog';

/** Board pages. Roadmap and Changelog join in phase 2. */
const NAV = [{ href: '/feedback', label: 'Feedback' }];

export function TopBar() {
  const brand = useBrand();
  const user = useUser();
  const { requireUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState(false);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    router.push(text ? `/feedback?q=${encodeURIComponent(text)}` : '/feedback');
  };

  return (
    <header className={cx('lt-topbar', searching && 'is-searching')}>
      <Link href="/feedback" className="lt-brand">
        <BrandMark />
        {brand.appName}
      </Link>
      <nav aria-label="Board" className="lt-nav">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="lt-nav-pill"
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <form role="search" onSubmit={search} className="lt-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          placeholder="Search ideas"
          aria-label="Search ideas"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <Button
        variant="ghost"
        icon="search"
        iconOnly
        aria-label="Search"
        className="lt-search-toggle"
        aria-expanded={searching}
        onClick={() => setSearching(!searching)}
      />
      {user ? (
        <>
          <button className="lt-avatar-button" aria-label="Your profile" onClick={() => setProfile(true)}>
            <Avatar
              name={user.name || user.email}
              src={avatarUrl({ id: user.id, avatar: user.avatar })}
              size={38}
              keyline
              team={user.isAdmin}
            />
          </button>
          <ProfileDialog open={profile} onOpenChange={setProfile} />
        </>
      ) : (
        <Button variant="secondary" onClick={() => requireUser('signin')}>
          Sign in
        </Button>
      )}
    </header>
  );
}

export function PoweredBy() {
  return (
    <footer className="lt-footer">
      <a href="https://github.com/hacker4ofakind/lort" target="_blank" rel="noreferrer">
        Powered by <b>Lort</b>
      </a>
    </footer>
  );
}
