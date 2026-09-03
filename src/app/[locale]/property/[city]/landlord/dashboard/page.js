import { Suspense, cache } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { requireLandlord } from '@/lib/requireStudent';
import { selectLandlordListings } from '@/lib/landlordListingSelect';
import { formatMoney } from '@/lib/formatMoney';
import {
  listingBlocker,
  liveReservations,
  todayHeadline,
  waitingOnReply,
} from '@/lib/hostToday';

import LandlordShell from '@/components/landlord/LandlordShell';
import CompositeAvatar from '@/components/landlord/CompositeAvatar';
import TodayCard from '@/components/landlord/TodayCard';
import Button from '@/components/ui/Button';

/*
  The landlord's "Today" — parity Feature 49.

  This replaced a six-tile metrics grid (ACTIVE LISTINGS / PENDING REQUESTS /
  PENDING INQUIRIES / VIEWS THIS MONTH / CONVERSION RATE / AVG. RESPONSE TIME)
  sitting above two widget panels. Airbnb's Today has no metrics at all, and
  the spec's argument for copying that is the audit: landlord response latency
  IS the conversion mechanism. A metrics grid reports how a landlord did; an
  action list tells them what to do next.

  Where the six tiles went (Feature 49 addendum): ACTIVE LISTINGS and
  AVG. RESPONSE TIME to the public landlord profile, PENDING REQUESTS and
  PENDING INQUIRIES to the dot on the Messages nav tab, VIEWS THIS MONTH to
  the nav's top-right, CONVERSION RATE dropped outright.

  NO PAGE HEADER FROM THE SHELL. Every other landlord page passes `eyebrow` and
  `title` to LandlordShell. This one owns its heading, because the heading IS
  the data ("3 people are waiting on you") and the shell's title prop is
  rendered before any Suspense boundary — passing it would block first paint on
  a query, which is exactly what #254 removed.

  ON THE RESERVATIONS SECTION. Airbnb's Today is a reservations dashboard.
  StudentX has one row in `bookings` in the entire database and its state is
  `expired`, so that section is correct but renders nothing today. The section
  that does work is the reply queue. See lib/hostToday.js.
*/

// ---- Per-request data loaders (cache()'d → one query each per request) ----

const loadListings = cache(async () => {
  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') return [];
  const { data, error } = await selectLandlordListings(auth.supabase, auth.landlord.landlord_id);
  if (error) return [];
  return data || [];
});

const loadVerification = cache(async () => {
  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') return { isVerified: false };
  const { data } = await auth.supabase
    .from('landlords')
    .select('is_verified')
    .eq('landlord_id', auth.landlord.landlord_id)
    .maybeSingle();
  return { isVerified: data?.is_verified === true };
});

/*
  No listing filter on either of these. Both tables carry a landlord-scoped
  SELECT policy keyed on auth.uid() ("Landlords can read their own listing
  inquiries", "Landlords read own listing bookings"), so a token-scoped client
  already sees exactly this landlord's rows — the same reasoning that took the
  service-role client out of /api/landlord/nav-summary.
*/
const loadInquiries = cache(async () => {
  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') return [];
  const { data, error } = await auth.supabase
    .from('inquiries')
    .select('inquiry_id, listing_id, student_name, status, created_at')
    .order('created_at', { ascending: false });
  return error ? [] : data || [];
});

const loadBookings = cache(async () => {
  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') return [];
  const { data, error } = await auth.supabase
    .from('bookings')
    .select('booking_id, listing_id, student_name, state, move_in, move_out, created_at')
    .order('created_at', { ascending: false });
  return error ? [] : data || [];
});

// ---- Page ----

export default async function LandlordDashboardPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') {
    const loginParams = new URLSearchParams();
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    const qs = loginParams.toString();
    redirect(`/property/thessaloniki/landlord/login${qs ? `?${qs}` : ''}`);
  }

  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });

  return (
    <LandlordShell gated={false} landlordName={(auth.landlord.name || '').trim()}>
      <div className="mx-auto max-w-3xl">
        <Suspense fallback={<HeadlineSkeleton eyebrow={t('eyebrow')} />}>
          <Headline locale={locale} />
        </Suspense>

        <Suspense fallback={null}>
          <WaitingSection locale={locale} />
        </Suspense>

        <Suspense fallback={null}>
          <BlockersSection locale={locale} />
        </Suspense>

        <Suspense fallback={null}>
          <ReservationsSection locale={locale} />
        </Suspense>

        <Suspense fallback={null}>
          <ListingsSection locale={locale} />
        </Suspense>
      </div>
    </LandlordShell>
  );
}

// ---- Streamed sections ----

async function Headline({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const [inquiries, bookings] = await Promise.all([loadInquiries(), loadBookings()]);
  const { count, longestWait } = todayHeadline(waitingOnReply({ inquiries, bookings }));

  return (
    <header className="pt-10 pb-8 text-center">
      <p className="label-caps text-blue">{t('eyebrow')}</p>
      <h1 className="font-display text-4xl md:text-5xl text-night leading-tight mt-2">
        {count === 0 ? t('headingNone') : t('headingWaiting', { count })}
      </h1>
      <p className="text-night/60 mt-3">
        {count === 0
          ? t('headingNoneBody')
          : longestWait && t('longestWait', { duration: longestWait })}
      </p>
      <div className="mt-6 flex justify-center">
        <Button href="/property/thessaloniki/landlord/listings/new" variant="gold" size="sm">
          {t('quickNewListing')}
        </Button>
      </div>
    </header>
  );
}

async function WaitingSection({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const [inquiries, bookings, listings] = await Promise.all([
    loadInquiries(),
    loadBookings(),
    loadListings(),
  ]);

  const waiting = waitingOnReply({ inquiries, bookings });
  if (waiting.length === 0) return null;

  const byId = new Map(listings.map((l) => [l.listing_id, l]));

  return (
    <Section title={t('waitingSection')}>
      {waiting.map((row) => {
        const listing = byId.get(row.listingId);
        const titleKey = row.kind === 'booking'
          ? (row.personName ? 'waitingBooking' : 'waitingBookingAnon')
          : (row.personName ? 'waitingInquiry' : 'waitingInquiryAnon');

        return (
          <TodayCard
            key={`${row.kind}-${row.id}`}
            tone="alert"
            eyebrow={t('waitingFor', { duration: formatWait(row.waitedMs) })}
            media={<ListingAvatar listing={listing} personName={row.personName} />}
            title={t(titleKey, { name: row.personName ?? '' })}
            subtitle={listingLabel(listing)}
            href={
              row.kind === 'booking'
                ? `/property/thessaloniki/landlord/reservations/${row.id}`
                : `/property/thessaloniki/landlord/inquiries/${row.id}/chat`
            }
            actionLabel={t('waitingReply')}
          />
        );
      })}
    </Section>
  );
}

async function BlockersSection({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const [listings, { isVerified }] = await Promise.all([loadListings(), loadVerification()]);

  const blocked = listings
    .map((listing) => ({
      listing,
      ...(listingBlocker({
        listing,
        isVerified,
        propertyVerifications: listing.property_verifications,
      }) || {}),
    }))
    .filter((row) => row.blocker);

  if (blocked.length === 0) return null;

  /*
    De-duplicated on `id_check`. It is account-level, so with three unpublished
    listings the naive mapping produces the same "Verify your ID" card three
    times — a list that looks like three tasks and is one.
  */
  const seenIdCheck = { done: false };
  const cards = blocked.filter((row) => {
    if (row.blocker !== 'id_check') return true;
    if (seenIdCheck.done) return false;
    seenIdCheck.done = true;
    return true;
  });

  return (
    <Section title={t('blockersSection')}>
      {cards.map(({ listing, blocker, actionable }) => (
        <TodayCard
          key={`${blocker}-${listing.listing_id}`}
          tone={actionable ? 'alert' : 'default'}
          media={<ListingAvatar listing={listing} />}
          title={t(blockerTitleKey(blocker))}
          subtitle={t(blockerBodyKey(blocker))}
          href={actionable ? blockerHref(blocker, listing) : null}
          actionLabel={actionable ? t('blockerAction') : null}
        />
      ))}
    </Section>
  );
}

async function ReservationsSection({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const [bookings, listings] = await Promise.all([loadBookings(), loadListings()]);
  const stays = liveReservations(bookings);
  const byId = new Map(listings.map((l) => [l.listing_id, l]));

  return (
    <Section
      title={t('reservationsSection')}
      seeAll={{ href: '/property/thessaloniki/landlord/reservations', label: t('reservationsSeeAll') }}
    >
      {stays.length === 0 ? (
        <p className="text-night/50 text-sm py-2">{t('reservationsEmpty')}</p>
      ) : (
        stays.map((b) => {
          const listing = byId.get(b.listing_id);
          return (
            <TodayCard
              key={b.booking_id}
              media={<ListingAvatar listing={listing} personName={b.student_name} />}
              title={t(b.student_name ? 'reservationStay' : 'reservationStayAnon', {
                name: b.student_name ?? '',
                date: formatDate(b.move_in),
              })}
              subtitle={listingLabel(listing)}
              href={`/property/thessaloniki/landlord/reservations/${b.booking_id}`}
            />
          );
        })
      )}
    </Section>
  );
}

async function ListingsSection({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const listings = await loadListings();
  if (listings.length === 0) return null;

  return (
    <Section
      title={t('listingsSection')}
      seeAll={{ href: '/property/thessaloniki/landlord/listings', label: t('listingsSeeAll') }}
    >
      {listings.slice(0, 5).map((listing) => (
        <TodayCard
          key={listing.listing_id}
          media={<ListingAvatar listing={listing} />}
          title={listing.location?.address || listing.title || '—'}
          subtitle={priceLabel(listing)}
          href={`/property/thessaloniki/landlord/listings/${listing.listing_id}/edit`}
        />
      ))}
    </Section>
  );
}

// ---- Presentational (pure JSX, no hooks — safe in RSC) ----

function Section({ title, seeAll, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-xl text-night">{title}</h2>
        {seeAll && (
          <Link href={seeAll.href} className="label-caps text-blue hover:text-night transition-colors">
            {seeAll.label} →
          </Link>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ListingAvatar({ listing, personName = null }) {
  const photo = listing?.photos?.find((url) => typeof url === 'string' && url.startsWith('http'));
  return (
    <CompositeAvatar
      photoUrl={photo ?? null}
      photoAlt={listing?.location?.address || listing?.title || ''}
      personName={personName || ''}
      personPhotoUrl={null}
      size={personName ? 'md' : 'sm'}
    />
  );
}

function listingLabel(listing) {
  if (!listing) return null;
  return listing.location?.address || listing.title || null;
}

function priceLabel(listing) {
  const price = listing?.rent?.monthly_price;
  const hood = listing?.location?.neighborhood;
  if (price == null) return hood || null;
  const money = `${formatMoney(price, listing.rent?.currency)}/mo`;
  return hood ? `${hood} · ${money}` : money;
}

const BLOCKER_TITLES = {
  id_check: 'blockerIdCheck',
  submit: 'blockerSubmit',
  video_call: 'blockerVideoCall',
  admin_review: 'blockerAdminReview',
};

const BLOCKER_BODIES = {
  id_check: 'blockerIdCheckBody',
  submit: 'blockerSubmitBody',
  video_call: 'blockerVideoCallBody',
  admin_review: 'blockerAdminReviewBody',
};

function blockerTitleKey(blocker) {
  return BLOCKER_TITLES[blocker] ?? 'blockerAdminReview';
}

function blockerBodyKey(blocker) {
  return BLOCKER_BODIES[blocker] ?? 'blockerAdminReviewBody';
}

/*
  Two destinations, because two of the blockers are not listing fields at all
  (Feature 51's table). ID verification and the video call live on the
  verification page; an unsubmitted listing goes to its editor.
*/
function blockerHref(blocker, listing) {
  if (blocker === 'id_check' || blocker === 'video_call') {
    return '/property/thessaloniki/landlord/verification';
  }
  return `/property/thessaloniki/landlord/listings/${listing.listing_id}/edit`;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/*
  Deliberately coarse — a wait is a rough age, not a stopwatch. `formatDuration`
  in landlordResponseTime.js is the precise one and is used for the headline's
  single "longest wait" figure; per-card it would put "3d 4h" on every row.
*/
function formatWait(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function HeadlineSkeleton({ eyebrow }) {
  return (
    <header className="pt-10 pb-8 text-center">
      <p className="label-caps text-blue">{eyebrow}</p>
      <div className="mx-auto mt-3 h-10 w-72 max-w-full bg-parchment rounded animate-pulse" />
      <div className="mx-auto mt-4 h-4 w-40 bg-parchment rounded animate-pulse" />
    </header>
  );
}
