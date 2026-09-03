import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

import { getLandlordProfile } from '@/lib/landlordProfile';
import { landlordProfileStats } from '@/lib/landlordProfileStats';
import ListingCard from '@/components/ListingCard';
import AboutMeCard from '@/components/landlord/AboutMeCard';
import Icon from '@/components/ui/Icon';
import Divider from '@/components/ui/Divider';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// "Month Year" from a timestamp, e.g. "March 2026". null/invalid → null so the
// caller can omit the line.
function formatMemberSince(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(d);
}

export async function generateMetadata({ params }) {
  const { locale, landlordId } = await params;
  const data = await getLandlordProfile(landlordId);
  if (!data) return {};
  const t = await getTranslations({ locale, namespace: 'propylaea.landlordProfile' });
  return {
    title: t('metaTitle', { name: data.landlord.name }),
    description: t('metaDescription', { name: data.landlord.name }),
    alternates: {
      canonical: `${SITE_URL}/property/thessaloniki/landlords/${landlordId}`,
    },
  };
}

export default async function LandlordProfilePage({ params }) {
  const { locale, landlordId } = await params;
  setRequestLocale(locale);

  // Verified-only: getLandlordProfile returns null for a missing OR unverified
  // landlord, so an unverified landlord's URL 404s rather than exposing a page.
  const data = await getLandlordProfile(landlordId);
  if (!data) notFound();

  const { landlord, listings } = data;
  const t = await getTranslations({ locale, namespace: 'propylaea.landlordProfile' });

  const memberSince = formatMemberSince(landlord.created_at);

  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-20 md:py-12">
      {/* Back to the directory */}
      <Link
        href="/property/thessaloniki/results"
        className="inline-flex items-center gap-2 label-caps text-night/60 hover:text-blue transition-colors mb-8"
      >
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" />
        {t('back')}
      </Link>

      <AboutMeCard
        name={landlord.name}
        photoUrl={landlord.profile_photo_url}
        /*
          Single-city platform, so "Thessaloniki, Greece" on its own is true of
          every landlord and tells a student nothing. Paired with member-since
          the line carries something; without a date it falls back to the bare
          location rather than showing an empty slot.
        */
        location={memberSince ? t('locationSince', { date: memberSince }) : t('location')}
        isVerified={landlord.is_verified}
        verifiedLabel={t('verified')}
        identityLine={t('identityLine')}
        stats={renderStats(landlordProfileStats({
          landlord,
          activeListingCount: listings.length,
        }), t)}
      />

      <Divider decorative className="my-10" />

      <h2 className="font-display text-2xl text-night mb-5">{t('listingsHeading')}</h2>

      {/* Their listings — same card as the directory */}
      {listings.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {listings.map((listing) => (
            <ListingCard key={listing.listing_id} listing={listing} />
          ))}
        </div>
      ) : (
        <p className="text-night/60 text-lg font-sans">{t('emptyState')}</p>
      )}
    </div>
  );
}

/*
  Turns the key-only rows from lib/landlordProfileStats.js into the strings
  AboutMeCard renders. The split keeps every "which stat, and is it worth
  showing" decision unit-testable and out of a React render.
*/
function renderStats(rows, t) {
  return rows.map((row) => ({
    key: row.key,
    value: row.valueKey ? t(row.valueKey) : String(row.count),
    label: t(row.labelKey, row.count == null ? undefined : { count: row.count }),
  }));
}
