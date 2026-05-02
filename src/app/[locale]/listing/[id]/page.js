import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

import { getListingForRender } from '@/lib/listingForRender';
import { requireStudent } from '@/lib/requireStudent';

import AuthGate from '@/components/AuthGate';
import ContactRail from '@/components/listing/ContactRail';
import ViewTracker from '@/components/listing/ViewTracker';
import Pill from '@/components/ui/Pill';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import VerifiedSeal from '@/components/ui/VerifiedSeal';
import OrnamentRule from '@/components/ui/OrnamentRule';

// Cap on the untrusted ?from= URL param. Real /results querystrings are
// well under this; anything bigger is almost certainly an attempt to
// stuff oversized payloads into the back-link / AuthGate redirect.
const MAX_FROM_LENGTH = 512;

export default async function ListingPage({ params, searchParams }) {
  const { locale, id } = await params;
  const sp = (await searchParams) || {};
  setRequestLocale(locale);

  // ?from=<urlencoded querystring> threads the user's prior /results
  // filter state into the back-link so it returns to the same filtered
  // view they came from. Plain ?from= param (or missing) → bare /results.
  // Drop oversized values (length cap above) — fall through to bare
  // /results rather than echoing untrusted bytes into the rendered href.
  const fromRawInput = typeof sp.from === 'string' ? sp.from : '';
  const fromRaw =
    fromRawInput && fromRawInput.length <= MAX_FROM_LENGTH ? fromRawInput : '';
  const backHref = fromRaw ? `/results?${fromRaw}` : '/results';

  // Auth gate — only authenticated students view listing detail. The
  // SEO metadata + JSON-LD live in the layout and still get served to
  // crawlers; this only replaces the page body.
  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const fromQs = fromRaw ? `?from=${encodeURIComponent(fromRaw)}` : '';
    const localePrefix = locale === 'el' ? '' : `/${locale}`;
    const nextPath = `${localePrefix}/listing/${id}${fromQs}`;
    return (
      <AuthGate
        next={nextPath}
        locale={locale}
        mode={auth?.kind === 'wrong-role' ? 'wrong-role' : 'guest'}
      />
    );
  }

  // React.cache() de-dupes this with the layout's fetch — one Supabase
  // round-trip per request instead of two.
  const listing = await getListingForRender(id);
  if (!listing) notFound();

  const t = await getTranslations({ locale, namespace: 'propylaea.listing' });
  const tListing = await getTranslations({ locale, namespace: 'listing' });

  const photos = (listing.photos || []).filter(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );
  const isVerified =
    listing.verified_tier &&
    listing.verified_tier !== 'none' &&
    listing.is_verified === true;

  const distances = deriveDestinations(listing.faculty_distances || [], t);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <ViewTracker listingId={listing.listing_id} />

      {/* Back link — server-rendered Link. Threads the prior /results
          filter state via ?from= so the back nav lands on the same
          filtered view the user came from (set by ListingCard). */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 label-caps text-night/60 hover:text-blue transition-colors mb-8"
      >
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" />
        {t('back')}
      </Link>

      {/* Photo gallery — responsive grid showing every uploaded photo */}
      <section className="mb-10">
        {photos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {photos.map((src, i) => (
              <PhotoTile
                key={src}
                src={src}
                alt={`${listing.address} — photo ${i + 1}`}
                priority={i === 0}
              />
            ))}
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
              <h1 className="mt-1 font-display text-4xl md:text-5xl text-night leading-tight text-balance">
                {listing.title || listing.address}
              </h1>
              {listing.address && (
                <p
                  className="mt-2 label-caps text-night/60"
                  aria-label={tListing('streetAddressA11y')}
                >
                  {listing.address}
                </p>
              )}
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
    </div>
  );
}

function PhotoTile({ src, alt, priority = false }) {
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

// Pick the three destination rows for the listing detail's distance
// table. Each row maps to a dedicated reference point seeded in
// migration 035: auth-medical (School of Medicine), ahepa-hospital
// (AHEPA University Hospital), auth-library (AUTH Central Library).
// compute_distances.py populates faculty_distances rows for every
// listing × faculty pair, so a simple by-id lookup is sufficient.
function deriveDestinations(facultyDistances, t) {
  const byId = (id) => facultyDistances.find((f) => f.faculty_id === id);
  const medicine = byId('auth-medical');
  const ahepa = byId('ahepa-hospital');
  const library = byId('auth-library');
  return [
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
}
