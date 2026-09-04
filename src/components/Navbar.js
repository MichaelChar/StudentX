'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import AccountMenu from './AccountMenu';
import MobileTabBar from './MobileTabBar';
import { activeTabKey, mobileTabsFor } from '@/lib/mobileTabs';
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
  const tabBar = authState.ready ? (
    <MobileTabBar tabs={tabs} ariaLabel={tMobile('label')} />
  ) : null;

  // All hooks above run unconditionally; only the rendered output is gated
  // (React Rules of Hooks). Landlord shell pages have their own top chrome —
  // but they still need the mobile bar.
  if (pathname && LANDLORD_SHELL_RE.test(pathname)) return tabBar;

  return (
    <>
      <TabTitleFlash count={unread.count} />
      {tabBar}
      <AccountMenu
        t={t}
        authState={authState}
        city={currentCity}
        accountHref={accountHref}
        messagesHref={messagesHref}
        unreadCount={unread.count}
        onSignOut={handleSignOut}
      />
    </>
  );
}

