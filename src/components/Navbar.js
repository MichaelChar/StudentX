'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import AccountMenu from './AccountMenu';
import TabTitleFlash from './TabTitleFlash';
import { DEFAULT_CITY } from '@/lib/cityRoutes';

// Routes under /property/{city}/landlord/ that render their own LandlordShell
// (sidebar + topbar) — the floating Navbar pill is redundant there. Auth-only
// pages (login, signup, etc.) are excluded so the pill still shows on those
// centered forms.
const LANDLORD_SHELL_RE =
  /\/property\/[^/]+\/landlord\/(?!(login|signup|forgot-password|reset-password|verify-email|onboarding)([/?]|$))/;

export default function Navbar() {
  const t = useTranslations('nav');
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

  // All hooks above run unconditionally; only the rendered output is gated
  // (React Rules of Hooks). Landlord shell pages have their own chrome.
  if (pathname && LANDLORD_SHELL_RE.test(pathname)) return null;

  return (
    <>
      <TabTitleFlash count={unread.count} />
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

