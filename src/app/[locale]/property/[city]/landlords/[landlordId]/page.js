import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

import { getLandlordProfile } from '@/lib/landlordProfile';
import ListingCard from '@/components/ListingCard';
import LandlordAvatar from '@/components/landlord/LandlordAvatar';
import VerifiedSeal from '@/components/ui/VerifiedSeal';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import OrnamentRule from '@/components/ui/OrnamentRule';

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
  const meta = [
    memberSince ? t('memberSince', { date: memberSince }) : null,
    t('propertyCount', { count: listings.length }),
  ]
    .filter(Boolean)
    .join('  ·  ');

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

      {/* Header — avatar, verified badge, name, member-since + property count */}
      <header className="flex flex-col sm:flex-row sm:items-center gap-6 mb-2">
        <LandlordAvatar
          name={landlord.name}
          photoUrl={landlord.profile_photo_url}
          size={104}
          className="border-2 border-yellow/60"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <VerifiedSeal size={28} />
            <Pill variant="verified">{t('verified')}</Pill>
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-night leading-tight text-balance">
            {landlord.name}
          </h1>
          <p className="label-caps text-night/50 mt-3">{meta}</p>
        </div>
      </header>

      <OrnamentRule className="my-8" />

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
