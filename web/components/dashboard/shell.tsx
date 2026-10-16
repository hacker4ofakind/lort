'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  IconAdjustments,
  IconExternalLink,
  IconInbox,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
} from '@tabler/icons-react';

import { Avatar, cx } from '@/components/lort';
import { BrandMark, useBrand } from '@/components/board/brand';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { avatarUrl } from '@/lib/pb';
import { isRejected, refreshProfile, signOutAdmin, useAdmin, useUser } from '@/lib/session';
import { useStats } from '@/lib/team-queries';

/** Dashboard pages. Roadmap and Changelog arrive in phase 2, Docs in phase 6. */
const NAV = [
  { href: '/dashboard/requests', label: 'Requests', icon: IconInbox, badge: true },
  { href: '/dashboard/settings', label: 'Settings', icon: IconAdjustments, bottom: true },
];

const RAIL_KEY = 'lort_sidebar_rail';

const noop = () => () => {};

/** A boolean kept in localStorage (per browser), shared by every component that reads it. */
function useLocalFlag(key: string): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('storage', onChange);
      return () => window.removeEventListener('storage', onChange);
    },
    () => {
      try {
        return localStorage.getItem(key) === '1';
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = (on: boolean) => {
    try {
      localStorage.setItem(key, on ? '1' : '0');
    } catch {}
    window.dispatchEvent(new StorageEvent('storage', { key }));
  };
  return [value, set];
}

/** Signed-in admins only; everyone else goes to the sign-in page. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  // False during the server render and hydration, true after: the session lives in localStorage.
  const ready = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!ready) return;
    if (!admin) {
      router.replace(`/dashboard/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    // The board-profile token expires sooner than the dashboard session: renew it each visit.
    // Only a rejected session signs out: a request cut short by navigating away, or a network
    // blip, must not.
    refreshProfile().catch((err: unknown) => {
      if (isRejected(err)) signOutAdmin();
    });
  }, [ready, admin, router, pathname]);

  if (!ready || !admin) return null;
  return <Frame>{children}</Frame>;
}

function Frame({ children }: { children: ReactNode }) {
  const [rail, setRail] = useLocalFlag(RAIL_KEY);
  const [menu, setMenu] = useState(false);
  const brand = useBrand();
  const toggleRail = () => setRail(!rail);

  return (
    <div className="dash">
      <aside aria-label="Dashboard" className={cx('dash-side', rail && 'is-rail')}>
        <div className="dash-brand" style={rail ? { padding: '4px 0 14px', flexDirection: 'column' } : undefined}>
          <BrandMark size={30} />
          {!rail && <span className="dash-brand-name">{brand.appName}</span>}
          <button
            type="button"
            className="lt-btn lt-btn-ghost lt-btn-icon lt-btn-sm"
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleRail}
          >
            {rail ? <IconLayoutSidebarLeftExpand size={18} /> : <IconLayoutSidebarLeftCollapse size={18} />}
          </button>
        </div>
        <Nav rail={rail} />
      </aside>

      <div className="dash-mobile-bar">
        <button
          type="button"
          className="lt-btn lt-btn-ghost lt-btn-icon"
          aria-label="Menu"
          onClick={() => setMenu(true)}
        >
          <IconMenu2 size={20} />
        </button>
        <BrandMark size={28} />
        <span className="dash-brand-name">{brand.appName}</span>
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-[260px] p-3" style={{ background: 'var(--ground-sunken)' }}>
          <SheetTitle className="sr-only">Dashboard menu</SheetTitle>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', paddingTop: 40 }}
            onClick={() => setMenu(false)}
          >
            <Nav rail={false} />
          </div>
        </SheetContent>
      </Sheet>

      <main className="dash-main">{children}</main>
    </div>
  );
}

function Nav({ rail }: { rail: boolean }) {
  const pathname = usePathname();
  const stats = useStats().data;
  const user = useUser();
  const item = (n: (typeof NAV)[number]) => {
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        className="side-item"
        aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
        title={rail ? n.label : undefined}
      >
        <Icon size={20} stroke={2} aria-hidden="true" />
        {!rail && n.label}
        {!rail && n.badge && stats && stats.new > 0 && <span className="side-badge">{stats.new} new</span>}
      </Link>
    );
  };
  return (
    <>
      {NAV.filter((n) => !n.bottom).map(item)}
      <div style={{ flex: 1 }} />
      <a
        className="side-item"
        href="/feedback"
        target="_blank"
        rel="noreferrer"
        title={rail ? 'View the board' : undefined}
      >
        <IconExternalLink size={20} stroke={2} aria-hidden="true" />
        {!rail && 'View the board'}
      </a>
      {NAV.filter((n) => n.bottom).map(item)}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: rail ? '12px 0 2px' : '12px 8px 2px' }}>
          <Avatar name={user.name || user.email} src={avatarUrl({ id: user.id, avatar: user.avatar })} size={28} team />
          {!rail && (
            <>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.name}
              </span>
              <button
                className="lt-text-button"
                style={{ fontSize: 12 }}
                onClick={() => {
                  signOutAdmin();
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
