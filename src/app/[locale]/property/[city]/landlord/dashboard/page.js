import { Suspense, cache } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';

import { Link } from '@/i18n/navigation';
import { requireLandlord } from '@/lib/requireStudent';
import { getSupabase } from '@/lib/supabase';
import { selectLandlordListings } from '@/lib/landlordListingSelect';
import { getLandlordResponseTime } from '@/lib/landlordResponseTime';
import { variantUrl } from '@/lib/photoVariants';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import VerifiedSeal from '@/components/ui/VerifiedSeal';

/*
  Propylaea landlord dashboard — server-rendered (#254).

  Was 'use client' with a three-phase gate (LandlordShell session probe →
  page getSession → 5 parallel fetches). Now it mirrors the student account
  page: requireLandlord() guards server-side, the shell + topbar greeting
  paint on the first byte (gated={false}), and each widget streams in its own
  <Suspense> as its query resolves. requireLandlord() is React.cache()'d, so
  every loader below resolves it from the per-request cache (one round-trip).

  All five API routes (/api/landlord/{listings,inquiries,analytics,
  response-time,billing/subscription}) are preserved — other pages and client
  flows still consume them. The loaders here copy those routes' queries.
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
  if (!auth || auth.kind === 'wrong-role') return { verifiedTier: 'none', isVerified: false };
  // verified_tier / is_verified live on the landlords row (NOT Stripe), so the
  // dashboard reads them directly rather than hitting the billing route's
  // getActiveSubscription — no Stripe latency on the render path.
  const { data } = await auth.supabase
    .from('landlords')
    .select('verified_tier, is_verified')
    .eq('landlord_id', auth.landlord.landlord_id)
    .maybeSingle();
  return {
    verifiedTier: data?.verified_tier ?? 'none',
    isVerified: data?.is_verified === true,
  };
});

const loadInquiries = cache(async () => {
  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') return { recent: [], pendingCount: 0 };
  const { data, error } = await auth.supabase
    .from('inquiries')
    .select(`
      inquiry_id,
      listing_id,
      student_name,
      student_email,
      student_phone,
      message,
      status,
      replied_at,
      created_at,
      listings ( listing_id, location ( address ) )
    `)
    .order('created_at', { ascending: false });
  if (error) return { recent: [], pendingCount: 0 };
  const inquiries = data || [];
  return {
    recent: inquiries.slice(0, 5),
    pendingCount: inquiries.filter((i) => i.status === 'pending').length,
  };
});

const loadAnalytics = cache(async () => {
  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') return { conversion_rate: 0, views_last_30_days: 0 };
  const listings = await loadListings();
  const listingIds = listings.map((l) => l.listing_id).filter(Boolean);
  if (listingIds.length === 0) return { conversion_rate: 0, views_last_30_days: 0 };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  // Same queries as /api/landlord/analytics: listing_views token-scoped,
  // inquiries via the anon client (mirrors the route exactly).
  const [allViewsRes, recentViewsRes, allInquiriesRes] = await Promise.all([
    auth.supabase.from('listing_views').select('listing_id, view_count').in('listing_id', listingIds),
    auth.supabase
      .from('listing_views')
      .select('listing_id, view_count')
      .in('listing_id', listingIds)
      .gte('view_date', cutoff),
    getSupabase().from('inquiries').select('listing_id, created_at').in('listing_id', listingIds),
  ]);

  const totalViews = (allViewsRes.data || []).reduce((s, v) => s + v.view_count, 0);
  const viewsLast30 = (recentViewsRes.data || []).reduce((s, v) => s + v.view_count, 0);
  const totalInquiries = (allInquiriesRes.data || []).length;
  const conversionRate = totalViews > 0 ? (totalInquiries / totalViews) * 100 : 0;

  return {
    conversion_rate: Math.round(conversionRate * 10) / 10,
    views_last_30_days: viewsLast30,
  };
});

const loadResponseTime = cache(async () => {
  const auth = await requireLandlord();
  if (!auth || auth.kind === 'wrong-role') return { count: 0, formatted: null };
  const listings = await loadListings();
  const listingIds = listings.map((l) => l.listing_id).filter(Boolean);
  try {
    return await getLandlordResponseTime(auth.supabase, listingIds);
  } catch {
    return { count: 0, formatted: null };
  }
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
    <LandlordShell
      gated={false}
      landlordName={auth.landlord.name}
      eyebrow={t('welcomeEyebrow')}
      title={t('welcomeTitle')}
      actions={
        <Button href="/property/thessaloniki/landlord/listings/new" variant="gold" size="sm">
          {t('quickNewListing')}
        </Button>
      }
    >
      {/* Stats row */}
      <Suspense fallback={<StatsRowSkeleton />}>
        <StatsRow locale={locale} />
      </Suspense>

      {/* Two-column widget grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <Suspense
            fallback={<ListingsCardSkeleton title={t('widgetListings')} viewAll={t('widgetListingsViewAll')} />}
          >
            <ListingsWidget locale={locale} />
          </Suspense>
        </section>

        <section>
          <Suspense
            fallback={<InquiriesCardSkeleton title={t('widgetInquiries')} viewAll={t('widgetInquiriesViewAll')} />}
          >
            <InquiriesWidget locale={locale} />
          </Suspense>
        </section>
      </div>

      {/* Verification card */}
      <section className="mt-6">
        <Suspense fallback={null}>
          <VerificationWidget locale={locale} />
        </Suspense>
      </section>
    </LandlordShell>
  );
}

// ---- Streamed widgets ----

async function StatsRow({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const [listings, analytics, inquiries, responseTime] = await Promise.all([
    loadListings(),
    loadAnalytics(),
    loadInquiries(),
    loadResponseTime(),
  ]);

  const activeListings = listings.length;
  const pendingInquiryCount = inquiries.pendingCount;
  const views30d = analytics?.views_last_30_days ?? 0;
  const conversionPct = analytics?.conversion_rate ?? 0;
  const hasReplies = (responseTime?.count ?? 0) > 0;
  const responseTimeValue = hasReplies ? responseTime.formatted : '—';

  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
      <StatTile label={t('statListings')} value={activeListings} />
      <StatTile label={t('statInquiries')} value={pendingInquiryCount} accent={pendingInquiryCount > 0} />
      <StatTile label={t('statViews')} value={views30d} />
      <StatTile label={t('statConversion')} value={`${conversionPct}%`} />
      <StatTile
        label={t('statResponseTime')}
        value={responseTimeValue}
        caption={!hasReplies ? t('statResponseTimeEmpty') : undefined}
      />
    </section>
  );
}

async function ListingsWidget({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const tLegacy = await getTranslations({ locale, namespace: 'landlord.dashboard' });
  const [listings, verification] = await Promise.all([loadListings(), loadVerification()]);
  const isSuper = verification.isVerified && verification.verifiedTier !== 'none';

  return (
    <Card tone="white" className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-2xl text-night">{t('widgetListings')}</h2>
        <Link
          href="/property/thessaloniki/landlord/listings"
          className="label-caps text-blue hover:text-night"
        >
          {t('widgetListingsViewAll')} →
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-night/15 rounded-sm">
          <p className="text-night/60 mb-4">{tLegacy('noListings')}</p>
          <Button href="/property/thessaloniki/landlord/listings/new" variant="primary" size="sm">
            {tLegacy('addFirst')}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-night/10">
          {listings.slice(0, 5).map((listing) => (
            <li key={listing.listing_id} className="py-4 first:pt-0 last:pb-0">
              <ListingRow listing={listing} isSuper={isSuper} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function InquiriesWidget({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const { recent } = await loadInquiries();

  return (
    <Card tone="white" className="p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-2xl text-night">{t('widgetInquiries')}</h2>
        <Link
          href="/property/thessaloniki/landlord/inquiries"
          className="label-caps text-blue hover:text-night"
        >
          {t('widgetInquiriesViewAll')} →
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="text-night/60 text-sm py-6">No inquiries yet.</p>
      ) : (
        <ul className="space-y-3">
          {recent.map((inq) => (
            <li key={inq.inquiry_id || inq.id}>
              <InquiryRow inquiry={inq} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function VerificationWidget({ locale }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.landlord.dashboard' });
  const { verifiedTier, isVerified } = await loadVerification();
  return <VerificationCard tier={verifiedTier} isVerified={isVerified} t={t} />;
}

// ---- Presentational (pure JSX, no hooks — safe in RSC) ----

function StatTile({ label, value, accent, caption }) {
  return (
    <Card
      tone={accent ? 'night' : 'parchment'}
      border={false}
      className={`p-5 ${accent ? 'text-stone' : ''}`}
    >
      <p className={`label-caps ${accent ? 'text-yellow' : 'text-night/60'}`}>{label}</p>
      <p
        className={`mt-2 font-display text-4xl md:text-5xl leading-none ${
          accent ? 'text-stone' : 'text-blue'
        }`}
      >
        {value}
      </p>
      {caption && (
        <p className={`mt-2 text-xs ${accent ? 'text-stone/60' : 'text-night/40'}`}>{caption}</p>
      )}
    </Card>
  );
}

function ListingRow({ listing, isSuper }) {
  const photo = listing.photos?.find((url) => typeof url === 'string' && url.startsWith('http'));
  const address = listing.location?.address || 'Untitled listing';
  const neighborhood = listing.location?.neighborhood;
  const price = listing.rent?.monthly_price;
  // is_featured (paying) alone is not enough — a subscribed-but-unverified
  // landlord isn't a SuperLandlord and gets no halo/ranking, so don't imply it.
  const status = isSuper && listing.is_featured ? 'SuperLandlord' : null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-16 h-16 rounded-sm bg-parchment overflow-hidden shrink-0">
        {photo ? (
          <Image src={variantUrl(photo, 'thumb')} alt={address} fill className="object-cover" sizes="64px" />
        ) : (
          <div className="flex items-center justify-center h-full text-night/20">
            <Icon name="photo" className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-display text-lg text-night truncate">{address}</p>
        <p className="label-caps text-night/50 mt-0.5 truncate">
          {neighborhood}
          {price != null && <> · €{price}/mo</>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {status && <Pill variant="verified">{status}</Pill>}
        <Link
          href={`/property/thessaloniki/landlord/listings/${listing.listing_id}/edit`}
          className="label-caps text-blue hover:text-night transition-colors"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}

function InquiryRow({ inquiry }) {
  const status = inquiry.status || 'pending';
  const statusVariant =
    status === 'pending' ? 'pending' : status === 'replied' ? 'info' : 'amenity';
  const statusLabel =
    status === 'pending' ? 'New' : status === 'replied' ? 'Replied' : 'Closed';
  const date = inquiry.created_at ? new Date(inquiry.created_at).toLocaleDateString() : '';
  const inquiryId = inquiry.inquiry_id || inquiry.id;

  return (
    <Link
      href={`/property/thessaloniki/landlord/inquiries/${inquiryId}/chat`}
      className="block rounded-sm border border-night/10 p-3 hover:border-blue transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="font-display text-base text-night truncate">
          {inquiry.student_name || inquiry.name || 'Student'}
        </p>
        <Pill variant={statusVariant}>{statusLabel}</Pill>
      </div>
      {inquiry.message && <p className="text-xs text-night/60 line-clamp-2">{inquiry.message}</p>}
      {date && <p className="label-caps text-night/40 mt-1">{date}</p>}
    </Link>
  );
}

function VerificationCard({ tier, isVerified, t }) {
  const isSubscribed = tier === 'verified' || tier === 'verified_pro';

  // Fully verified — paid AND admin-approved ID.
  if (isSubscribed && isVerified) {
    return (
      <Card tone="parchment" className="p-6 flex items-center gap-5">
        <VerifiedSeal size={52} />
        <div className="flex-1">
          <p className="label-caps text-yellow">{t('widgetVerification')}</p>
          <p className="font-display text-2xl text-night mt-1">{t('verifiedTitle')}</p>
          <p className="text-night/70 text-sm mt-1">{t('verifiedBody')}</p>
        </div>
      </Card>
    );
  }

  // Subscribed but ID not yet approved — congratulate + nudge to upload.
  if (isSubscribed) {
    return (
      <Card tone="parchment" className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-center gap-5">
            <VerifiedSeal size={52} />
            <div>
              <p className="label-caps text-yellow">{t('widgetVerification')}</p>
              <p className="font-display text-2xl text-night mt-1">{t('subscribedAwaitingIdTitle')}</p>
              <p className="text-night/70 text-sm mt-1 max-w-md">{t('subscribedAwaitingIdBody')}</p>
            </div>
          </div>
          <Button href="/property/thessaloniki/landlord/verification" variant="gold" size="md">
            {t('submitIdCta')}
          </Button>
        </div>
      </Card>
    );
  }

  // ID approved but no subscription — show their progress + nudge to subscribe.
  if (isVerified) {
    return (
      <Card tone="parchment" className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-center gap-5">
            <VerifiedSeal size={52} />
            <div>
              <p className="label-caps text-yellow">{t('widgetVerification')}</p>
              <p className="font-display text-2xl text-night mt-1">
                {t('idApprovedAwaitingSubscriptionTitle')}
              </p>
              <p className="text-night/70 text-sm mt-1 max-w-md">
                {t('idApprovedAwaitingSubscriptionBody')}
              </p>
            </div>
          </div>
          <Button href="/property/thessaloniki/landlord/get-verified" variant="gold" size="md">
            {t('chooseSubscription')}
          </Button>
        </div>
      </Card>
    );
  }

  // No subscription, no approved ID — original CTA to upgrade.
  return (
    <Card tone="night" className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-full border border-yellow/50 flex items-center justify-center">
            <Icon name="shield" className="w-5 h-5 text-yellow" />
          </div>
          <div>
            <p className="label-caps text-yellow">{t('widgetVerification')}</p>
            <p className="font-display text-2xl text-stone mt-1">{t('unverifiedTitle')}</p>
            <p className="text-stone/70 text-sm mt-1 max-w-md">{t('unverifiedBody')}</p>
          </div>
        </div>
        <Button href="/property/thessaloniki/landlord/get-verified" variant="gold" size="md">
          {t('quickVerify')}
        </Button>
      </div>
    </Card>
  );
}

// ---- Suspense skeletons (titles passed in so the card chrome paints with the
// real heading; only the data body pulses) ----

function StatsRowSkeleton() {
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} tone="parchment" border={false} className="p-5">
          <div className="h-3 w-16 bg-night/10 rounded animate-pulse" />
          <div className="mt-3 h-9 w-16 bg-night/10 rounded animate-pulse" />
        </Card>
      ))}
    </section>
  );
}

function ListingsCardSkeleton({ title, viewAll }) {
  return (
    <Card tone="white" className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-2xl text-night">{title}</h2>
        <span className="label-caps text-blue/60">{viewAll} →</span>
      </div>
      <ul className="divide-y divide-night/10">
        {[1, 2, 3].map((i) => (
          <li key={i} className="py-4 flex items-center gap-4 first:pt-0 last:pb-0">
            <div className="w-16 h-16 rounded-sm bg-parchment animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 bg-parchment rounded animate-pulse" />
              <div className="h-3 w-1/3 bg-parchment rounded animate-pulse" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InquiriesCardSkeleton({ title, viewAll }) {
  return (
    <Card tone="white" className="p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-2xl text-night">{title}</h2>
        <span className="label-caps text-blue/60">{viewAll} →</span>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-parchment rounded animate-pulse" />
        ))}
      </div>
    </Card>
  );
}
