'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter, usePathname, Link } from '@/i18n/navigation';
import { HeaderSlotTarget } from './HeaderSlot';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import { onAuthChange } from '@/lib/onAuthChange';
import AccountMenu from './AccountMenu';
import MobileTabBar from './MobileTabBar';
import { activeTabKey, isChromelessMobileRoute, mobileTabsFor } from '@/lib/mobileTabs';
import TabTitleFlash from './TabTitleFlash';
import { DEFAULT_CITY } from '@/lib/cityRoutes';

// Routes under /property/{city}/landlord/ that render their own LandlordShell
// (its own top nav) — the floating Navbar pill is redundant there. Auth-only
// pages (login, signup, etc.) are excluded so the pill still shows on those
// centered forms.
const LANDLORD_SHELL_RE =
  /\/property\/[^/]+\/landlord\/(?!(login|signup|forgot-password|reset-password|verify-email|onboarding)([/?]|$))/;


export default function Navbar() {
  const t = useTranslations('nav');
  const tMobile = useTranslations('nav.mobileTabs');
  const router = useRouter();
  const pathname = usePathname();
  const [authState, setAuthState] = useState({ ready: false, role: null, name: null });
  const [unread, setUnread] = useState({ count: 0, role: null });

  const cityMatch = pathname?.match(/^\/property\/([^/]+)/);
  const currentCity = cityMatch?.[1] ?? DEFAULT_CITY;

  /*
    Bumped by every auth refresh. Auth-change handlers run deferred (see
    onAuthChange below), so two refreshes can overlap: one started before a
    sign-out can still be awaiting /api/auth/me when the SIGNED_OUT refresh
    has already cleared the bar — and the old access token stays valid after
    sign-out, so that late response is a 200 that would paint the account
    back. Each refresh, and each unread fetch, checks it is still the newest
    before setting state. Only written in async handlers, never in render.
  */
  const authGen = useRef(0);

  const fetchUnread = useCallback(async () => {
    const gen = authGen.current;
    const current = () => gen === authGen.current;
    try {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await withTimeout(supabase.auth.getSession());
      if (!current()) return;
      if (!session?.access_token) {
        setUnread({ count: 0, role: null });
        return;
      }
      const res = await withTimeout(
        fetch('/api/me/unread', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      );
      if (!res.ok || !current()) return;
      const json = await res.json();
      if (!current()) return;
      setUnread({ count: json.count || 0, role: json.role || null });
    } catch {
      // Silent — badge stays as-is.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();

    async function refresh() {
      const gen = ++authGen.current;
      // Still mounted, and no newer refresh has started since this one.
      const current = () => !cancelled && gen === authGen.current;
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession());
        if (!current()) return;
        if (!session?.access_token) {
          setAuthState({ ready: true, role: null, name: null });
          setUnread({ count: 0, role: null });
          return;
        }
        const res = await withTimeout(
          fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        );
        if (!current()) return;
        if (!res.ok) {
          setAuthState({ ready: true, role: null, name: null });
          return;
        }
        const { user } = await res.json();
        if (!current()) return;
        setAuthState({ ready: true, role: user?.role || null, name: user?.name || null });
        fetchUnread();
      } catch {
        if (current()) setAuthState({ ready: true, role: null, name: null });
      }
    }

    refresh();
    // Deferred through onAuthChange rather than subscribed inline: refresh()
    // awaits getSession(), and gotrue notifies listeners while holding its auth
    // lock, so returning refresh() to it deadlocked every sign-out for
    // refresh()'s 15 s timeout. See src/lib/onAuthChange.js.
    const { data: { subscription } } = onAuthChange(supabase, () => refresh());

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchUnread]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUnread();
  }, [pathname, fetchUnread]);

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await signOutSafely(supabase);
    router.push('/');
  }

  // Landlords land on the dashboard; students get their real profile screen,
  // NOT `/student/account` — that is a redirect() onto the saved view, which is
  // the menu's Wishlists row.
  const accountHref =
    authState.role === 'landlord'
      ? `/property/${currentCity}/landlord/dashboard`
      : '/student/account/profile';

  const messagesHref =
    authState.role === 'landlord'
      ? `/property/${currentCity}/landlord/inquiries`
      : '/student/inquiries';

  /*
    The mobile bottom tab bar — parity Feature 56.

    It lives here rather than in the layout because Navbar already resolves the
    two things it needs: the caller's ROLE and the unread count. A second
    component computing both would mean a second getSession and a second
    /api/me/unread on every page.

    It renders on EVERY route, including the landlord shell — the bar is what
    replaces the desktop top nav below `md`, so suppressing it there would
    leave a landlord on a phone with no navigation at all. The floating account
    pill stays suppressed, because LandlordShell has its own.
  */
  const tabs = mobileTabsFor({ role: authState.role, city: currentCity }).map((tab) => ({
    key: tab.key,
    href: tab.href,
    label: tMobile(tab.labelKey),
    icon: tab.icon,
    active: false,
    dot: Boolean(tab.dotted && unread.count > 0),
    dotLabel: tMobile('waiting'),
  }));
  const activeKey = activeTabKey(
    mobileTabsFor({ role: authState.role, city: currentCity }),
    pathname,
  );
  for (const tab of tabs) tab.active = tab.key === activeKey;

  /*
    Hold the bar back until auth is KNOWN. Rendering the signed-out pair first
    and swapping to four tabs a beat later is a visible flicker on the surface
    a student uses most, and worse than a moment with no bar.
  */
  const chromelessMobile = isChromelessMobileRoute(pathname);

  const tabBar =
    authState.ready && !chromelessMobile ? (
      <MobileTabBar tabs={tabs} ariaLabel={tMobile('label')} />
    ) : null;

  // All hooks above run unconditionally; only the rendered output is gated
  // (React Rules of Hooks). Landlord shell pages have their own top chrome —
  // but they still need the mobile bar.
  if (pathname && LANDLORD_SHELL_RE.test(pathname)) return tabBar;

  /*
    The global header — brand, search slot, account. Parity Feature 3 fixes its
    contents: logo + search + right-hand controls, no product tabs.

    From `md` it is sticky (72px, `--header-h` in globals.css) with a blurred
    backdrop. Below `md` it is a static 56px strip that scrolls away: the tab
    bar is the mobile navigation (§8.2), but the account pill still has to
    live somewhere — its panel is the only mobile route to /resources, /gigs
    and /student/ausom for a logged-out visitor (founder's call, 2026-09-04) —
    and a real bar is what stops it floating over page content.

    The chromeless mobile PDP (Feature 58) hides the whole header below `md`.
  */
  return (
    <>
      <TabTitleFlash count={unread.count} />
      {tabBar}
      {/* Height lives on <header> itself (border-box, border included) so it
          is exactly `--header-h`; on the inner row it measured 73px and every
          sticky offset overlapped the border by a pixel. */}
      <header
        className={`relative z-40 h-14 border-b border-night/10 bg-stone md:sticky md:top-0 md:h-[72px] md:bg-stone/85 md:backdrop-blur-md${
          chromelessMobile ? ' hidden md:block' : ''
        }`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-5">
          <Link
            href="/"
            aria-label={t('homeAria')}
            className="shrink-0 rounded-control focus-visible:outline-offset-4"
          >
            <Image
              src="/logo-tesla.svg"
              alt=""
              width={140}
              height={20}
              priority
              className="h-4 w-auto md:h-5"
            />
          </Link>
          {/* Filled by a page via <HeaderSlot> — the results search pill. */}
          <HeaderSlotTarget className="hidden min-w-0 flex-1 justify-center md:flex" />
          <div className="ml-auto shrink-0">
            <AccountMenu
              t={t}
              authState={authState}
              city={currentCity}
              accountHref={accountHref}
              messagesHref={messagesHref}
              unreadCount={unread.count}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      </header>
    </>
  );
}

