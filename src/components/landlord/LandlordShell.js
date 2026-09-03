'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { signOutSafely } from '@/lib/authHelpers';
import { hasWaiting } from '@/lib/hostNavSummary';

import LandlordTopNav from '@/components/landlord/LandlordTopNav';
import LandlordAccountMenu from '@/components/landlord/LandlordAccountMenu';
import BauhausLoader from '@/components/BauhausLoader';

/*
  Landlord shell — top nav + page header wrapper.

  Used by every authenticated landlord page. Auth pages (login/signup/etc.)
  skip this shell.

  SIDEBAR → TOP NAV (parity Feature 49). This was a 240px fixed dark sidebar
  carrying six destinations: Dashboard / Listings / Reservations / Inquiries /
  Verification / Settings. Feature 49 cuts it to a top bar with three —
  `Today · Listings · Messages` — and moves the rest into the account menu.
  The reason is not aesthetic: six equally-weighted destinations tell a
  landlord nothing about what to do next, and the sidebar spent a sixth of the
  viewport saying so on every page.

  The `eyebrow` / `title` / `actions` prop contract is UNCHANGED, so all
  eleven pages that render this shell needed no edit. Only the chrome moved.

  Auth gate is still the shell's responsibility: no Supabase session →
  redirect to the landlord login. This centralizes the check so pages don't
  re-implement it.
*/

const CITY = 'thessaloniki';

/*
  Exactly three, in this order. `messages` points at the existing inquiries
  inbox — Feature 53 rebuilds that surface as three panes, but the destination
  and the label are settled now so the nav does not change twice.
*/
const NAV_ITEMS = [
  { key: 'today', href: `/property/${CITY}/landlord/dashboard` },
  { key: 'listings', href: `/property/${CITY}/landlord/listings` },
  { key: 'messages', href: `/property/${CITY}/landlord/inquiries`, dotted: true },
];

export default function LandlordShell({
  title,
  eyebrow,
  actions,
  children,
  // gated (default true): client pages let the shell run the Supabase auth
  // gate + greeting fetch. A server-gated page (the dashboard, #254) passes
  // gated={false} so the shell renders immediately — its own requireLandlord()
  // already guarded auth, and landlordName is supplied as a prop.
  gated = true,
  landlordName: landlordNameProp = '',
}) {
  const t = useTranslations('propylaea.landlord.nav');
  const tLoaders = useTranslations('loaders');
  const router = useRouter();
  const pathname = usePathname();
  const [landlordName, setLandlordName] = useState(landlordNameProp);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [summary, setSummary] = useState(null);
  // When ungated, there is nothing to wait for — paint on first render.
  const [sessionReady, setSessionReady] = useState(!gated);

  /*
    One effect, one session lookup, two fire-and-forget fetches.

    Everything after the gate is chrome: the greeting, the avatar, the views
    figure and the Messages dot. None of it blocks the page — `sessionReady`
    flips as soon as auth is known (#256), and each piece of state renders
    conditionally so a late arrival just pops in.

    Both fetches run on the ungated dashboard too. It supplies `landlordName`
    as a prop but not the photo, and the nav numbers are the shell's business
    on every page regardless of who guarded auth.
  */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (gated) {
        if (!session) {
          router.replace(`/property/${CITY}/landlord/login`);
          return;
        }
        if (!session.user.email_confirmed_at) {
          router.replace(`/property/${CITY}/landlord/verify-email`);
          return;
        }
        if (!cancelled) setSessionReady(true);
      }

      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      // GET (not POST): the shell only reads, and POST-on-every-mount would
      // attempt to create a landlord row for any authed user — including
      // students, which hits the prevent_dual_role trigger (migration 036).
      const profile = fetch('/api/landlord/profile', { headers })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (cancelled || !body?.landlord) return;
          if (body.landlord.name) setLandlordName(body.landlord.name);
          if (body.landlord.profile_photo_url) setPhotoUrl(body.landlord.profile_photo_url);
        })
        .catch(() => {});

      const nav = fetch('/api/landlord/nav-summary', { headers })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (!cancelled && body?.summary) setSummary(body.summary);
        })
        .catch(() => {});

      await Promise.all([profile, nav]);
    })();

    return () => {
      cancelled = true;
    };
    /*
      `router` is deliberately NOT a dependency. next-intl's useRouter() hands
      back a fresh object every render, so listing it re-runs this effect on
      every state change it causes — measured at eight identical
      /api/landlord/nav-summary requests inside 60ms on one dashboard load.
      Its methods are stable; only the wrapper's identity churns, so re-running
      on it buys nothing and costs a request storm on every landlord page.

      An earlier attempt guarded the fetch with a ref instead. That was worse:
      under StrictMode the first invocation set the ref and was then cancelled
      by its own cleanup, while the second saw the ref and skipped the fetch —
      so the Messages dot never rendered at all. Fix the dependency, not the
      symptom.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated]);

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await signOutSafely(supabase);
    router.push(`/property/${CITY}/landlord/login`);
  }

  // Loading state while the gated auth check resolves (never shown when ungated)
  if (gated && !sessionReady) {
    return (
      <div className="min-h-screen bg-stone flex items-center justify-center">
        <BauhausLoader
          mode="block"
          eyebrow={tLoaders('processing')}
          statuses={tLoaders.raw('loadingCycle')}
        />
      </div>
    );
  }

  const waiting = hasWaiting(summary);

  const items = NAV_ITEMS.map((item) => ({
    key: item.key,
    href: item.href,
    label: t(item.key),
    active: Boolean(pathname?.includes(item.href)),
    dot: Boolean(item.dotted && waiting),
    dotLabel: t('waiting'),
  }));

  /*
    Hidden at zero rather than shown as "0". This sits in permanent chrome on
    every page: a landlord who has just created their first listing would read
    a standing zero as a scoreboard, and the addendum re-homed this metric
    precisely to stop it being one. Nothing to report, nothing rendered.
  */
  const views = summary?.viewsLast30 > 0 ? summary.viewsLast30.toLocaleString('en-GB') : null;

  return (
    <div className="min-h-screen bg-stone flex flex-col">
      <LandlordTopNav
        items={items}
        brand="StudentX"
        homeHref={`/property/${CITY}/landlord/dashboard`}
        navLabel={t('primaryNav')}
        menuLabel={t('openMenu')}
        viewsValue={views}
        viewsLabel={t('viewsLabel')}
        trailing={
          <LandlordAccountMenu
            t={t}
            name={landlordName}
            photoUrl={photoUrl}
            city={CITY}
            onSignOut={handleSignOut}
          />
        }
      />

      {/* Page header — the eyebrow/title/actions contract every page relies on */}
      {(eyebrow || title || actions) && (
        /*
          Stacks below `sm`. Side by side, a long title ("Good to see you,
          michaelcharlesg") is squeezed by the action button into "Good to
          see …" on a 375px screen — the greeting loses the name that is the
          entire point of it.
        */
        <div className="px-5 md:px-8 pt-8 pb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex-1 min-w-0">
            {eyebrow && <p className="label-caps text-blue">{eyebrow}</p>}
            {title && (
              <h1 className="font-display text-3xl md:text-4xl text-night leading-tight mt-1">
                {title}
              </h1>
            )}
          </div>
          {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
        </div>
      )}

      <main className="flex-1 px-5 md:px-8 py-6">{children}</main>
    </div>
  );
}
