'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import LocaleSwitcher from './LocaleSwitcher';
import Icon from './ui/Icon';

export default function Navbar() {
  const t = useTranslations('nav');
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authState, setAuthState] = useState({ ready: false, role: null, name: null });
  const closeButtonRef = useRef(null);

  // Propylaea nav — "The programme" and "FAQ" are defined in the design but
  // hidden for now; unhide when those pages ship.
  const navLinks = [
    { href: '/results', label: t('listings') },
    { href: '/quiz', label: t('takeTheQuiz') },
    // { href: '/programme', label: t('programme') },
    // { href: '/faq', label: t('faq') },
  ];

  // Resolve role through /api/auth/me using the browser session token. The
  // server endpoint returns { user: null } when unauthenticated, so guests
  // settle into the signed-out state without us treating non-200s as errors.
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();

    async function refresh() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) setAuthState({ ready: true, role: null, name: null });
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (!cancelled) setAuthState({ ready: true, role: null, name: null });
          return;
        }
        const { user } = await res.json();
        if (!cancelled) {
          setAuthState({ ready: true, role: user?.role || null, name: user?.name || null });
        }
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
  }, []);

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

  return (
    <nav className="sticky top-0 z-50 bg-stone/95 backdrop-blur border-b border-night/10">
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

function DesktopAuthMenu({ t, authState, accountHref, onSignOut }) {
  // Until the role probe resolves, render a placeholder of the correct width
  // so the navbar doesn't reflow when auth state arrives.
  if (!authState.ready) {
    return <span className="label-caps text-night/30">{t('signInStudent')}</span>;
  }

  if (authState.role) {
    return (
      <>
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

function MobileAuthMenu({ t, authState, accountHref, onClose, onSignOut }) {
  if (!authState.ready) return null;

  if (authState.role) {
    return (
      <>
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
