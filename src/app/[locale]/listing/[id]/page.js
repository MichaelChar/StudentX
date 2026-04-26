import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

import { getSupabase } from '@/lib/supabase';
import { transformListing } from '@/lib/transformListing';

import ContactRail from '@/components/listing/ContactRail';
import ViewTracker from '@/components/listing/ViewTracker';
import ReviewList from '@/components/ReviewList';
import Pill from '@/components/ui/Pill';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import VerifiedSeal from '@/components/ui/VerifiedSeal';
import OrnamentRule from '@/components/ui/OrnamentRule';

const LISTING_SELECT = `
  listing_id,
  description,
  photos,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name, contact_info, verified_tier ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

// Same shape as the existing API endpoint at src/app/api/listings/[id]/route.js,
// but pulled in directly from the server component so the page SSRs the
// listing instead of waiting for a client-side fetch (#audit M6 — bad for SEO
// + first-contentful-paint).
async function fetchListing(id) {
  if (!id || !/^\d[\d-]+$/.test(id)) return null;
  try {
    const { data, error } = await getSupabase()
      .from('listings')
      .select(LISTING_SELECT)
      .eq('listing_id', id)
      .single();
    if (error || !data) return null;
    return transformListing(data);
  } catch {
    return null;
  }
}

export default async function ListingPage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const listing = await fetchListing(id);
  if (!listing) notFound();

  const t = await getTranslations({ locale, namespace: 'propylaea.listing' });
  const tListing = await getTranslations({ locale, namespace: 'listing' });

  const photos = (listing.photos || []).filter(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );
  const isVerified =
    listing.verified_tier && listing.verified_tier !== 'none';

  const distances = deriveDestinations(listing.faculty_distances || [], t);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <ViewTracker listingId={listing.listing_id} />

      {/* Back link — server-rendered Link instead of router.back() to keep
          the back button server-side. Loses prior-search context but gains
          SEO + crawlability. */}
      <Link
        href="/results"
        className="inline-flex items-center gap-2 label-caps text-night/60 hover:text-blue transition-colors mb-8"
      >
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" />
        {t('back')}
      </Link>

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

        {/* Right column — sticky inquiry rail (client-side for modal state) */}
        <ContactRail listing={listing} />
      </div>

      {/* Reviews */}
      <div className="mt-16 pt-10 border-t border-night/10">
        <ReviewList listingId={listing.listing_id} />
      </div>
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
