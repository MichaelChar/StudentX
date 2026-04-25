'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import InquiryForm from '@/components/InquiryForm';
import ReviewList from '@/components/ReviewList';
import Button from '@/components/ui/Button';
import Pill from '@/components/ui/Pill';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import VerifiedSeal from '@/components/ui/VerifiedSeal';
import OrnamentRule from '@/components/ui/OrnamentRule';

/*
  Propylaea listing detail — matches page 07 of the reference design.
  Photo gallery, gold verified seal + programme pill, bilingual field
  rows, amenity chips, distance-to-school table, sticky inquiry rail.
*/
export default function ListingPage() {
  const t = useTranslations('propylaea.listing');
  const tListing = useTranslations('listing');
  const tInquiry = useTranslations('inquiry');
  const { id } = useParams();
  const router = useRouter();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);

  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`/api/listings/${id}`);
        if (!res.ok) {
          setError(
            res.status === 404
              ? tListing('listingNotFound')
              : tListing('somethingWentWrong'),
          );
          return;
        }
        const data = await res.json();
        setListing(data.listing);
        fetch(`/api/listings/${id}/view`, { method: 'POST' }).catch(() => {});
      } catch {
        setError(tListing('failedToLoad'));
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id, tListing]);

  if (loading) return <ListingSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="font-display text-3xl text-night mb-3">
          {tListing('listingNotFound')}
        </h1>
        <p className="text-night/60 mb-8">{tListing('listingNotFoundDesc')}</p>
        <Button href="/results" variant="gold">
          {tListing('backToSearchBtn')}
        </Button>
      </div>
    );
  }

  const photos = (listing.photos || []).filter(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );
  const isVerified =
    listing.verified_tier && listing.verified_tier !== 'none';

  // Destinations we want to show in the distance table — Propylaea spec.
  // If the API returns matches, use them; otherwise fall back to whatever
  // faculty_distances returned.
  const distances = deriveDestinations(listing.faculty_distances || [], t);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 label-caps text-night/60 hover:text-blue transition-colors mb-8 cursor-pointer"
      >
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" />
        {t('back')}
      </button>

      {/* Photo gallery — two-up mosaic matching the design */}
      <section className="mb-10">
        {photos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PhotoTile
              src={photos[0]}
              alt={`${listing.address} — interior`}
              label="Interior"
              priority
            />
            <PhotoTile
              src={photos[1] || photos[0]}
              alt={`${listing.address} — kitchen`}
              label="Kitchen"
            />
          </div>
        ) : (
          <div className="aspect-[16/9] rounded-sm bg-parchment flex items-center justify-center">
            <Icon name="photo" className="w-16 h-16 text-night/20" />
          </div>
        )}
      </section>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10">
        {/* Left column */}
        <div>
          {/* Hero stripe — verified seal + programme tag + address */}
          <div className="flex flex-col md:flex-row md:items-start gap-5 mb-8">
            {isVerified && <VerifiedSeal size={52} />}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {isVerified && <Pill variant="verified">{t('verified')}</Pill>}
                <Pill variant="programme">{t('authMedicalProgramme')}</Pill>
              </div>
              <p className="label-caps text-night/50">
                {listing.neighborhood} &middot; Thessaloniki
              </p>
              <h1 className="mt-1 font-display text-4xl md:text-5xl text-night leading-tight">
                {listing.address}
              </h1>
            </div>
          </div>

          {/* Bilingual field grid */}
          <Card tone="parchment" border={false} className="p-6 md:p-8 mb-10">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <BilingualField
                greek={t('rentGreek')}
                english={t('rentEnglish')}
                value={
                  listing.monthly_price != null ? (
                    <>
                      €{listing.monthly_price}
                      <span className="text-base text-night/50">/mo</span>
                    </>
                  ) : (
                    <span className="text-base text-night/50">
                      {tListing('priceOnRequest')}
                    </span>
                  )
                }
              />
              <BilingualField
                greek={t('depositGreek')}
                english={t('depositEnglish')}
                value={
                  listing.deposit != null && listing.deposit > 0
                    ? `€${listing.deposit}`
                    : '—'
                }
              />
              <BilingualField
                greek={t('typeGreek')}
                english={t('typeEnglish')}
                value={listing.property_type}
              />
            </dl>
          </Card>

          {/* Description */}
          {listing.description && (
            <section className="mb-10">
              <p className="font-display italic text-night/60">
                {t('descriptionGreek')}
              </p>
              <p className="label-caps text-night/80 mt-1 mb-4">
                {t('descriptionEnglish')}
              </p>
              <p className="text-night/80 leading-relaxed text-lg font-sans">
                {listing.description}
              </p>
            </section>
          )}

          {/* Amenities */}
          {listing.amenities?.length > 0 && (
            <section className="mb-10">
              <p className="font-display italic text-night/60">
                {t('amenitiesGreek')}
              </p>
              <p className="label-caps text-night/80 mt-1 mb-4">
                {t('amenitiesEnglish')}
              </p>
              <div className="flex flex-wrap gap-2">
                {listing.amenities.map((amenity) => (
                  <Pill key={amenity} variant="amenity">
                    {amenity}
                  </Pill>
                ))}
              </div>
            </section>
          )}

          <OrnamentRule className="my-8" />

          {/* Distance table */}
          <section className="mb-10">
            <p className="font-display italic text-night/60">
              {t('distanceGreek')}
            </p>
            <p className="label-caps text-night/80 mt-1 mb-5">
              {t('distanceEnglish')}
            </p>

            <table className="w-full text-left">
              <thead>
                <tr className="label-caps text-night/50 border-b border-night/10">
                  <th className="py-3 font-normal">{t('destination')}</th>
                  <th className="py-3 font-normal text-right">{t('walk')}</th>
                  <th className="py-3 font-normal text-right">{t('transit')}</th>
                </tr>
              </thead>
              <tbody>
                {distances.map((d) => (
                  <tr key={d.name} className="border-b border-night/5">
                    <td className="py-4 font-display text-lg text-night">
                      {d.name}
                    </td>
                    <td className="py-4 text-right font-sans text-night/80">
                      {d.walk != null ? `${d.walk} min` : '—'}
                    </td>
                    <td className="py-4 text-right font-sans text-night/80">
                      {d.transit != null ? `${d.transit} min` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* Right column — sticky inquiry rail */}
        <aside>
          <div className="lg:sticky lg:top-24">
            <Card tone="white" className="p-6">
              <p className="font-display text-3xl text-blue">
                {listing.monthly_price != null ? (
                  <>
                    €{listing.monthly_price}
                    <span className="text-base text-night/50">/mo</span>
                  </>
                ) : (
                  <span className="text-base text-night/50">
                    {tListing('priceOnRequest')}
                  </span>
                )}
              </p>
              <div className="mt-2">
                <Pill variant="programme">{t('authMedicalProgramme')}</Pill>
              </div>
              <p className="mt-5 text-night/70 text-sm leading-relaxed">
                {t('directTagline')}
              </p>
              <div className="mt-5">
                <Button
                  variant="gold"
                  onClick={() => setInquiryOpen(true)}
                  className="w-full justify-center"
                >
                  {t('sendInquiry')}
                </Button>
              </div>
              <p className="mt-3 label-caps text-night/50 text-center">
                {t('replyWithin24h')}
              </p>
            </Card>
          </div>
        </aside>
      </div>

      {/* Reviews */}
      <div className="mt-16 pt-10 border-t border-night/10">
        <ReviewList listingId={listing.listing_id} />
      </div>

      {/* Inquiry modal */}
      {inquiryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-night/60"
            onClick={() => setInquiryOpen(false)}
          />
          <Card
            tone="white"
            className="relative z-10 w-full max-w-lg p-6 md:p-8"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-2xl text-night">
                {tInquiry('sendMessage')}
              </p>
              <button
                onClick={() => setInquiryOpen(false)}
                className="p-1 text-night/60 hover:text-night"
                aria-label={tInquiry('close')}
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <InquiryForm listingId={listing.listing_id} />
          </Card>
        </div>
      )}
    </div>
  );
}

function PhotoTile({ src, alt, label, priority = false }) {
  return (
    <div className="relative aspect-[4/3] rounded-sm overflow-hidden bg-parchment">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 50vw"
        priority={priority}
      />
      <span className="absolute top-3 left-3 label-caps text-white/90 bg-night/40 backdrop-blur px-2 py-1 rounded-sm">
        {label}
      </span>
    </div>
  );
}

function BilingualField({ greek, english, value }) {
  return (
    <div>
      <dt>
        <span className="font-display italic text-night/60 block text-sm">
          {greek}
        </span>
        <span className="label-caps text-night/80 block mt-0.5">
          {english}
        </span>
      </dt>
      <dd className="mt-2 font-display text-2xl text-night leading-tight">
        {value}
      </dd>
    </div>
  );
}

// Derive the 3 Propylaea destinations from whatever faculty_distances
// the API returned. Match by fuzzy name; fall back to showing the first
// N rows with their original names if no matches found.
function deriveDestinations(facultyDistances, t) {
  const byKey = (keyword) =>
    facultyDistances.find((f) =>
      (f.faculty_name || '').toLowerCase().includes(keyword),
    );

  const medicine = byKey('medic') || byKey('ιατρ');
  const ahepa = byKey('ahepa') || byKey('αχεπα');
  const library = byKey('libr') || byKey('βιβλι');

  const picks = [
    {
      name: t('destSchool'),
      walk: medicine?.walk_minutes,
      transit: medicine?.transit_minutes,
    },
    {
      name: t('destHospital'),
      walk: ahepa?.walk_minutes,
      transit: ahepa?.transit_minutes,
    },
    {
      name: t('destLibrary'),
      walk: library?.walk_minutes,
      transit: library?.transit_minutes,
    },
  ];

  // If no matches at all and we have raw distances, surface the first three.
  const anyMatched = medicine || ahepa || library;
  if (!anyMatched && facultyDistances.length > 0) {
    return facultyDistances.slice(0, 3).map((f) => ({
      name: f.faculty_name,
      walk: f.walk_minutes,
      transit: f.transit_minutes,
    }));
  }

  return picks;
}

function ListingSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12 animate-pulse">
      <div className="h-4 w-28 bg-parchment rounded mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
        <div className="aspect-[4/3] rounded-sm bg-parchment" />
        <div className="aspect-[4/3] rounded-sm bg-parchment" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10">
        <div className="space-y-8">
          <div className="h-10 w-3/4 bg-parchment rounded" />
          <div className="h-28 bg-parchment rounded-sm" />
          <div className="h-40 bg-parchment rounded" />
        </div>
        <div className="h-56 bg-parchment rounded-sm" />
      </div>
    </div>
  );
}
