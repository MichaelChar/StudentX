'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import UnreadBadge from './UnreadBadge';
import TabTitleFlash from './TabTitleFlash';
import { DEFAULT_CITY } from '@/lib/cityRoutes';

// Routes under /property/{city}/landlord/ that render their own LandlordShell
// (sidebar + topbar) — the floating Navbar pill is redundant there. Auth-only
// pages (login, signup, etc.) are excluded so the pill still shows on those
// centered forms.
const LANDLORD_SHELL_RE =
  /\/property\/[^/]+\/landlord\/(?!(login|signup|forgot-password|reset-password|verify-email|onboarding|charter)([/?]|$))/;

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
    await supabase.auth.signOut();
    router.push('/');
  }

  const accountHref =
    authState.role === 'landlord' ? `/property/${currentCity}/landlord/dashboard` : '/student/account';

  const inquiriesHref =
    authState.role === 'landlord' ? `/property/${currentCity}/landlord/inquiries` : '/student/account';

  // All hooks above run unconditionally; only the rendered output is gated
  // (React Rules of Hooks). Landlord shell pages have their own chrome.
  if (pathname && LANDLORD_SHELL_RE.test(pathname)) return null;

  return (
    <>
      <TabTitleFlash count={unread.count} />
      <AuthMenu
        t={t}
        authState={authState}
        accountHref={accountHref}
        inquiriesHref={inquiriesHref}
        landlordLoginHref={`/property/${currentCity}/landlord/login`}
        unreadCount={unread.count}
        onSignOut={handleSignOut}
      />
    </>
  );
}

const PILL_CLASS =
  'fixed top-5 right-5 z-50 flex items-center gap-3 bg-stone/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm';

function AuthMenu({ t, authState, accountHref, inquiriesHref, landlordLoginHref, unreadCount, onSignOut }) {
  if (!authState.ready) {
    return (
      <nav className={PILL_CLASS}>
        <span className="label-caps text-night/30">{t('signIn')}</span>
      </nav>
    );
  }

  if (authState.role) {
    return (
      <nav className={PILL_CLASS}>
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
      </nav>
    );
  }

  return <SignInDropdown t={t} landlordLoginHref={landlordLoginHref} />;
}

// Staggered dropdown animation. Functions of `reduced` so prefers-reduced-motion
// collapses the stagger/scale to an instant show/hide.
const menuVariants = (reduced) => ({
  open: {
    scaleY: 1,
    transition: {
      when: 'beforeChildren',
      staggerChildren: reduced ? 0 : 0.06,
      duration: reduced ? 0 : 0.2,
    },
  },
  closed: {
    scaleY: 0,
    transition: {
      when: 'afterChildren',
      staggerChildren: reduced ? 0 : 0.06,
      duration: reduced ? 0 : 0.2,
    },
  },
});

const menuItemVariants = (reduced) => ({
  open: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.2 } },
  closed: { opacity: 0, y: reduced ? 0 : -12, transition: { duration: reduced ? 0 : 0.2 } },
});

// Inline Feather "chevron-down" (no react-icons dependency).
function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SignInDropdown({ t, landlordLoginHref }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (!open) return undefined;

    function handlePointer(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const items = [
    { href: '/student/login', label: t('signInAsStudent') },
    { href: landlordLoginHref, label: t('signInAsLandlord') },
  ];

  return (
    <div ref={wrapperRef} className="fixed top-5 right-5 z-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="label-caps flex items-center gap-2 rounded-full bg-blue text-stone px-5 py-2 shadow-sm hover:bg-night transition-colors"
      >
        <span>{t('signIn')}</span>
        <motion.span
          className="inline-flex"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.2 }}
        >
          <ChevronDown />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial="closed"
            animate="open"
            exit="closed"
            variants={menuVariants(prefersReduced)}
            style={{ originY: 0 }}
            className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-lg bg-stone p-1 shadow-lg ring-1 ring-night/10"
          >
            {items.map((item) => (
              <motion.li key={item.href} role="none" variants={menuItemVariants(prefersReduced)}>
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-4 py-2.5 text-sm text-night transition-colors hover:bg-blue/10 hover:text-blue"
                >
                  {item.label}
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
