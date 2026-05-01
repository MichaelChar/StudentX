'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import Icon from '@/components/ui/Icon';
import LocaleSwitcher from '@/components/LocaleSwitcher';

/*
  Propylaea landlord shell — fixed sidebar + topbar wrapper.
  Used by every authenticated landlord page (dashboard, listings, inquiries,
  verification, billing). Auth pages (login/signup/etc.) skip this shell.

  Auth gate is the shell's responsibility: if no Supabase session, redirect
  to /landlord/login. This centralizes the check so pages don't re-implement.
*/

const NAV_ITEMS = [
  { key: 'dashboard', href: '/landlord/dashboard', icon: 'home' },
  { key: 'listings', href: '/landlord/listings', icon: 'book' },
  { key: 'inquiries', href: '/landlord/inquiries', icon: 'message' },
  { key: 'verification', href: '/landlord/verification', icon: 'shield' },
  { key: 'billing', href: '/landlord/get-verified', icon: 'euro' },
  { key: 'settings', href: '/landlord/settings', icon: 'cog' },
];

export default function LandlordShell({ title, eyebrow, actions, children }) {
  const t = useTranslations('propylaea.landlord.nav');
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [landlordName, setLandlordName] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  // Auth gate — centralized here, so each page doesn't re-check.
  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/landlord/login');
        return;
      }
      if (!session.user.email_confirmed_at) {
        router.replace('/landlord/verify-email');
        return;
      }
      // Best-effort profile name fetch so topbar can greet. GET (not POST):
      // the shell only reads, and POST-on-every-mount would attempt to
      // create a landlord row for any authed user — including students,
      // which now hits the prevent_dual_role trigger from migration 036.
      try {
        const profileRes = await fetch('/api/landlord/profile', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (profileRes.ok) {
          const { landlord } = await profileRes.json();
          if (landlord?.name) setLandlordName(landlord.name);
        }
      } catch {}
      setSessionReady(true);
    })();
  }, [router]);

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/landlord/login');
  }

  // Skeleton while auth gate is resolving
  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-stone flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-3 text-night/50">
          <div className="w-2.5 h-2.5 rounded-full bg-gold" />
          <span className="label-caps">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-[240px] flex-col bg-night text-stone fixed inset-y-0 left-0 z-[60]">
        <SidebarContent
          t={t}
          pathname={pathname}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-night/60 z-40 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[80%] bg-night text-stone z-50 lg:hidden flex flex-col">
            <SidebarContent
              t={t}
              pathname={pathname}
              onSignOut={handleSignOut}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 lg:ml-[240px] flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-stone border-b border-night/10">
          <div className="px-5 md:px-8 py-4 flex items-center gap-4">
            {/* Mobile menu */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-1 text-night"
              aria-label="Open menu"
            >
              <Icon name="list" className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">
              {eyebrow && (
                <p className="label-caps text-gold">{eyebrow}</p>
              )}
              {title && (
                <h1 className="font-display text-2xl md:text-3xl text-night leading-tight truncate">
                  {title}
                  {landlordName && eyebrow?.toLowerCase().includes('welcome') ? (
                    <span className="italic text-gold"> {landlordName}</span>
                  ) : null}
                </h1>
              )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {actions}
              <LocaleSwitcher />
              <button
                type="button"
                onClick={handleSignOut}
                title={t('signOut')}
                className="label-caps text-night/60 hover:text-blue transition-colors hidden md:inline-flex items-center gap-1.5"
              >
                <Icon name="logout" className="w-4 h-4" />
                {t('signOut')}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 md:px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({ t, pathname, onSignOut, onNavigate }) {
  return (
    <>
      {/* Brand */}
      <div className="px-6 pt-7 pb-8">
        <p className="font-display text-xl text-stone">
          StudentX <span className="text-stone/40">×</span>{' '}
          <span className="italic text-gold">AUSOM</span>
        </p>
        <p className="label-caps text-stone/40 mt-1">Landlord portal</p>
      </div>

      <div aria-hidden="true" className="mx-6 h-px bg-stone/10" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.includes(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-sm label-caps transition-colors relative ${
                active
                  ? 'bg-white/5 text-stone'
                  : 'text-stone/60 hover:bg-white/5 hover:text-stone'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-2 bottom-2 w-0.5 bg-gold rounded-r"
                />
              )}
              <Icon name={item.icon} className="w-4 h-4 shrink-0" />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer — sign out + version */}
      <div className="px-6 py-5 border-t border-stone/10">
        <button
          type="button"
          onClick={onSignOut}
          className="label-caps text-stone/60 hover:text-stone transition-colors inline-flex items-center gap-2"
        >
          <Icon name="logout" className="w-4 h-4" />
          {t('signOut')}
        </button>
        <p className="mt-4 text-stone/30 text-[10px] font-display italic">
          Propylaea · v2
        </p>
      </div>
    </>
  );
}
