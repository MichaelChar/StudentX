'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import LocaleSwitcher from './LocaleSwitcher';
import Icon from './ui/Icon';
import UnreadBadge from './UnreadBadge';
import TabTitleFlash from './TabTitleFlash';

export default function Navbar() {
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authState, setAuthState] = useState({ ready: false, role: null, name: null });
  const [unread, setUnread] = useState({ count: 0, role: null });
  const closeButtonRef = useRef(null);

  // Propylaea nav — "The programme" and "FAQ" are defined in the design but
  // hidden for now; unhide when those pages ship.
  const navLinks = [
    { href: '/results', label: t('listings') },
    { href: '/quiz', label: t('takeTheQuiz') },
    // { href: '/programme', label: t('programme') },
    // { href: '/faq', label: t('faq') },
  ];

  // Shared fetcher — refreshes unread count using the current session token.
  // All awaits are timeout-wrapped so a hung Supabase / API call can't leave
  // the badge in a stale state forever.
  const fetchUnread = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await withTimeout(supabase.auth.getSession());
      if (!session?.access_token) {
        setUnread({ count: 0, role: null });
        return;
      }
      const res = await withTimeout(
        fetch('/api/me/unread', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      );
      if (!res.ok) return;
      const json = await res.json();
      setUnread({ count: json.count || 0, role: json.role || null });
    } catch {
      // Silent — badge stays as-is.
    }
  }, []);

  // Resolve role through /api/auth/me using the browser session token. The
  // server endpoint returns { user: null } when unauthenticated, so guests
  // settle into the signed-out state without us treating non-200s as errors.
  // The whole probe is wrapped in try/catch + withTimeout so setAuthState
  // ({ ready: true }) ALWAYS runs — without it, a hung getSession() (e.g.
  // stale session-refresh on Cloudflare Workers cold start) leaves the
  // navbar stuck on the placeholder forever, which previously hid the
  // landlord-login link from guests on flaky sessions.
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();

    async function refresh() {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession());
        if (!session?.access_token) {
          if (!cancelled) {
            setAuthState({ ready: true, role: null, name: null });
            setUnread({ count: 0, role: null });
          }
          return;
        }
        const res = await withTimeout(
          fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        );
        if (!res.ok) {
          if (!cancelled) setAuthState({ ready: true, role: null, name: null });
          return;
        }
        const { user } = await res.json();
        if (!cancelled) {
          setAuthState({ ready: true, role: user?.role || null, name: user?.name || null });
        }
        if (!cancelled) fetchUnread();
      } catch {
        if (!cancelled) setAuthState({ ready: true, role: null, name: null });
      }
    }

    refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => refresh());

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchUnread]);

  // Refresh unread count on every route change so navigating back from
  // a chat thread (after marking as read) updates the badge promptly.
  // The lint rule below flags setState-in-effect; here the effect is
  // an intentional pathname subscription, not a render-time setState
  // cascade — same shape as the existing role-fetch effect above.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUnread();
  }, [pathname, fetchUnread]);

  useEffect(() => {
    if (drawerOpen) {
      closeButtonRef.current?.focus();
      const handleEscape = (e) => {
        if (e.key === 'Escape') setDrawerOpen(false);
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [drawerOpen]);

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/');
  }

  const accountHref =
    authState.role === 'landlord' ? '/landlord/dashboard' : '/student/account';

  const inquiriesHref =
    authState.role === 'landlord' ? '/landlord/inquiries' : '/student/account';

  return (
    <nav className="sticky top-0 z-50 bg-stone/95 backdrop-blur border-b border-night/10">
      <TabTitleFlash count={unread.count} />
      <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-night hover:text-blue transition-colors"
        >
          <span className="font-display text-xl tracking-tight">
            StudentX <span className="text-night/40">×</span>{' '}
            <span className="italic">AUSOM</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="label-caps text-night/70 hover:text-blue transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <span className="h-5 w-px bg-night/15" aria-hidden="true" />
          <LocaleSwitcher />
          <DesktopAuthMenu
            t={t}
            authState={authState}
            accountHref={accountHref}
            inquiriesHref={inquiriesHref}
            unreadCount={unread.count}
            onSignOut={handleSignOut}
          />
        </div>

        <button
          className="md:hidden p-2 text-night"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('openMenu')}
        >
          <Icon name="list" className="w-6 h-6" />
        </button>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 bg-night/60 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('menu')}
        className={`fixed right-0 top-0 h-full w-full bg-stone z-50 shadow-xl transform transition-transform duration-300 md:hidden ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-night/10">
          <span className="font-display text-lg text-night">{t('menu')}</span>
          <button
            ref={closeButtonRef}
            onClick={() => setDrawerOpen(false)}
            className="p-2 text-night"
            aria-label={t('closeMenu')}
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col p-5 gap-5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className="label-caps text-night hover:text-blue transition-colors text-base"
            >
              {link.label}
            </Link>
          ))}
          <MobileAuthMenu
            t={t}
            authState={authState}
            accountHref={accountHref}
            inquiriesHref={inquiriesHref}
            unreadCount={unread.count}
            onClose={() => setDrawerOpen(false)}
            onSignOut={async () => {
              setDrawerOpen(false);
              await handleSignOut();
            }}
          />
          <div className="pt-3 border-t border-night/10">
            <LocaleSwitcher />
          </div>
        </div>
      </div>
    </nav>
  );
}

function DesktopAuthMenu({ t, authState, accountHref, inquiriesHref, unreadCount, onSignOut }) {
  // Until the role probe resolves, render a placeholder of the correct width
  // so the navbar doesn't reflow when auth state arrives.
  if (!authState.ready) {
    return <span className="label-caps text-night/30">{t('signInStudent')}</span>;
  }

  if (authState.role) {
    return (
      <>
        <UnreadBadge count={unreadCount} href={inquiriesHref} />
        <Link
          href={accountHref}
          className="label-caps text-blue hover:text-night transition-colors"
        >
          {t('myAccount')}
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="label-caps text-night/60 hover:text-blue transition-colors"
        >
          {t('signOut')}
        </button>
      </>
    );
  }

  return (
    <>
      <Link
        href="/student/login"
        className="label-caps text-blue hover:text-night transition-colors"
      >
        {t('signInStudent')}
      </Link>
      <Link
        href="/landlord/login"
        className="label-caps text-night/50 hover:text-night transition-colors"
      >
        {t('signInLandlord')}
      </Link>
    </>
  );
}

function MobileAuthMenu({ t, authState, accountHref, inquiriesHref, unreadCount, onClose, onSignOut }) {
  if (!authState.ready) return null;

  if (authState.role) {
    return (
      <>
        {unreadCount > 0 && (
          <Link
            href={inquiriesHref}
            onClick={onClose}
            aria-label={t('unreadAria', { count: unreadCount })}
            className="label-caps text-blue hover:text-night transition-colors text-base inline-flex items-center gap-3"
          >
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-gold text-white text-[11px] font-sans font-semibold px-1.5"
            >
              {unreadCount >= 100 ? '99+' : unreadCount}
            </span>
            <span>{t('inbox')}</span>
          </Link>
        )}
        <Link
          href={accountHref}
          onClick={onClose}
          className="label-caps text-blue hover:text-night transition-colors text-base"
        >
          {t('myAccount')}
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="label-caps text-night/60 hover:text-blue transition-colors text-base text-left"
        >
          {t('signOut')}
        </button>
      </>
    );
  }

  return (
    <>
      <Link
        href="/student/login"
        onClick={onClose}
        className="label-caps text-blue hover:text-night transition-colors text-base"
      >
        {t('signInStudent')}
      </Link>
      <Link
        href="/landlord/login"
        onClick={onClose}
        className="label-caps text-night/60 hover:text-night transition-colors text-base"
      >
        {t('signInLandlord')}
      </Link>
    </>
  );
}
