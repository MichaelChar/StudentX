'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import VerifiedSeal from '@/components/ui/VerifiedSeal';

/*
  Propylaea landlord dashboard — widget-based rebuild.

  Layout:
    - Stats row (active listings, pending inquiries, views, conversion)
    - Two-column widget grid:
        - Left: Your listings (compact rows, max 5 + view all)
        - Right: Recent inquiries (compact cards, max 5 + view all)
        - Bottom: Verification card (state-dependent)

  All existing API contracts are preserved — this is pure UI.
*/
export default function LandlordDashboardPage() {
  const t = useTranslations('propylaea.landlord.dashboard');
  const tLegacy = useTranslations('landlord.dashboard');
  const router = useRouter();

  const [listings, setListings] = useState([]);
  const [recentInquiries, setRecentInquiries] = useState([]);
  const [pendingInquiryCount, setPendingInquiryCount] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const [verifiedTier, setVerifiedTier] = useState('none');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchListings(token) {
    try {
      const res = await fetch('/api/landlord/listings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { listings: data } = await res.json();
        setListings(data || []);
      } else {
        setError('Failed to load listings');
      }
    } catch {
      setError('Failed to load listings');
    }
  }

  async function fetchInquiries(token) {
    try {
      const res = await fetch('/api/landlord/inquiries', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { inquiries } = await res.json();
        setRecentInquiries((inquiries || []).slice(0, 5));
        setPendingInquiryCount(
          (inquiries || []).filter((i) => i.status === 'pending').length
        );
      }
    } catch {}
  }

  async function fetchAnalytics(token) {
    try {
      const res = await fetch('/api/landlord/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { analytics: data } = await res.json();
        setAnalytics(data);
      }
    } catch {}
  }

  async function fetchSubscription(token) {
    try {
      const res = await fetch('/api/landlord/billing/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { verifiedTier: tier } = await res.json();
        setVerifiedTier(tier ?? 'none');
      }
    } catch {}
  }

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // LandlordShell handles redirect
      await Promise.all([
        fetchListings(session.access_token),
        fetchAnalytics(session.access_token),
        fetchInquiries(session.access_token),
        fetchSubscription(session.access_token),
      ]);
      setLoading(false);
    })();
  }, []);

  const activeListings = listings.length;
  const conversionPct = analytics?.conversion_rate ?? 0;
  const views30d = analytics?.views_last_30_days ?? 0;

  return (
    <LandlordShell
      eyebrow={t('welcomeEyebrow')}
      title={t('welcomeTitle')}
      actions={
        <>
          <Button href="/landlord/listings/new" variant="gold" size="sm">
            {t('quickNewListing')}
          </Button>
        </>
      }
    >
      {error && (
        <p className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
          {error}
        </p>
      )}

      {/* Stats row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatTile
          label={t('statListings')}
          value={activeListings}
          loading={loading}
        />
        <StatTile
          label={t('statInquiries')}
          value={pendingInquiryCount}
          loading={loading}
          accent={pendingInquiryCount > 0}
        />
        <StatTile
          label={t('statViews')}
          value={views30d}
          loading={loading}
        />
        <StatTile
          label={t('statConversion')}
          value={`${conversionPct}%`}
          loading={loading}
        />
      </section>

      {/* Two-column widget grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Listings widget */}
        <section className="lg:col-span-2">
          <Card tone="white" className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-2xl text-night">
                {t('widgetListings')}
              </h2>
              <Link
                href="/landlord/listings"
                className="label-caps text-blue hover:text-night"
              >
                {t('widgetListingsViewAll')} →
              </Link>
            </div>

            {loading ? (
              <ListingsSkeleton />
            ) : listings.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-night/15 rounded-sm">
                <p className="text-night/60 mb-4">
                  {tLegacy('noListings')}
                </p>
                <Button href="/landlord/listings/new" variant="primary" size="sm">
                  {tLegacy('addFirst')}
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-night/10">
                {listings.slice(0, 5).map((listing) => (
                  <li key={listing.listing_id} className="py-4 first:pt-0 last:pb-0">
                    <ListingRow listing={listing} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* Inquiries widget */}
        <section>
          <Card tone="white" className="p-6 h-full">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-2xl text-night">
                {t('widgetInquiries')}
              </h2>
              <Link
                href="/landlord/inquiries"
                className="label-caps text-blue hover:text-night"
              >
                {t('widgetInquiriesViewAll')} →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-parchment rounded animate-pulse" />
                ))}
              </div>
            ) : recentInquiries.length === 0 ? (
              <p className="text-night/60 text-sm py-6">
                {tLegacy('noListings') && 'No inquiries yet.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {recentInquiries.map((inq) => (
                  <li key={inq.id || inq.inquiry_id}>
                    <InquiryRow inquiry={inq} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {/* Verification card */}
      <section className="mt-6">
        <VerificationCard tier={verifiedTier} t={t} />
      </section>
    </LandlordShell>
  );
}

function StatTile({ label, value, loading, accent }) {
  return (
    <Card
      tone={accent ? 'night' : 'parchment'}
      border={false}
      className={`p-5 ${accent ? 'text-stone' : ''}`}
    >
      <p
        className={`label-caps ${accent ? 'text-gold' : 'text-night/60'}`}
      >
        {label}
      </p>
      <p
        className={`mt-2 font-display text-4xl md:text-5xl leading-none ${
          accent ? 'text-stone' : 'text-blue'
        }`}
      >
        {loading ? (
          <span className="inline-block w-16 h-9 bg-night/10 rounded animate-pulse" />
        ) : (
          value
        )}
      </p>
    </Card>
  );
}

function ListingRow({ listing }) {
  const photo = listing.photos?.find((url) => typeof url === 'string' && url.startsWith('http'));
  const address = listing.location?.address || 'Untitled listing';
  const neighborhood = listing.location?.neighborhood;
  const price = listing.rent?.monthly_price;
  const status = listing.is_featured ? 'Featured' : null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-16 h-16 rounded-sm bg-parchment overflow-hidden shrink-0">
        {photo ? (
          <Image
            src={photo}
            alt={address}
            fill
            className="object-cover"
            sizes="64px"
          />
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
          href={`/landlord/listings/${listing.listing_id}/edit`}
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
    status === 'pending' ? 'verified'
    : status === 'replied' ? 'info'
    : 'amenity';
  const statusLabel =
    status === 'pending' ? 'New'
    : status === 'replied' ? 'Replied'
    : 'Closed';
  const date = inquiry.created_at
    ? new Date(inquiry.created_at).toLocaleDateString()
    : '';

  return (
    <Link
      href="/landlord/inquiries"
      className="block rounded-sm border border-night/10 p-3 hover:border-blue transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="font-display text-base text-night truncate">
          {inquiry.student_name || inquiry.name || 'Student'}
        </p>
        <Pill variant={statusVariant}>{statusLabel}</Pill>
      </div>
      {inquiry.message && (
        <p className="text-xs text-night/60 line-clamp-2">
          {inquiry.message}
        </p>
      )}
      {date && (
        <p className="label-caps text-night/40 mt-1">{date}</p>
      )}
    </Link>
  );
}

function VerificationCard({ tier, t }) {
  if (tier === 'verified' || tier === 'verified_pro') {
    return (
      <Card tone="parchment" className="p-6 flex items-center gap-5">
        <VerifiedSeal size={52} />
        <div className="flex-1">
          <p className="label-caps text-gold">{t('widgetVerification')}</p>
          <p className="font-display text-2xl text-night mt-1">
            {t('verifiedTitle')}
          </p>
          <p className="text-night/70 text-sm mt-1">{t('verifiedBody')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card tone="night" className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-full border border-gold/50 flex items-center justify-center">
            <Icon name="shield" className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="label-caps text-gold">{t('widgetVerification')}</p>
            <p className="font-display text-2xl text-stone mt-1">
              {t('unverifiedTitle')}
            </p>
            <p className="text-stone/70 text-sm mt-1 max-w-md">
              {t('unverifiedBody')}
            </p>
          </div>
        </div>
        <Button href="/landlord/get-verified" variant="gold" size="md">
          {t('quickVerify')}
        </Button>
      </div>
    </Card>
  );
}

function ListingsSkeleton() {
  return (
    <ul className="divide-y divide-night/10">
      {[1, 2, 3].map((i) => (
        <li
          key={i}
          className="py-4 flex items-center gap-4 first:pt-0 last:pb-0"
        >
          <div className="w-16 h-16 rounded-sm bg-parchment animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-parchment rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-parchment rounded animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}
