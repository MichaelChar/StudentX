import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

import { getListingForRender } from '@/lib/listingForRender';
import { requireStudent } from '@/lib/requireStudent';

import AuthGate from '@/components/AuthGate';
import ContactRail from '@/components/listing/ContactRail';
import ViewTracker from '@/components/listing/ViewTracker';
import ReviewList from '@/components/ReviewList';
import Pill from '@/components/ui/Pill';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import VerifiedSeal from '@/components/ui/VerifiedSeal';
import OrnamentRule from '@/components/ui/OrnamentRule';

export default async function ListingPage({ params, searchParams }) {
  const { locale, id } = await params;
  const sp = (await searchParams) || {};
  setRequestLocale(locale);

  // ?from=<urlencoded querystring> threads the user's prior /results
  // filter state into the back-link so it returns to the same filtered
  // view they came from. Plain ?from= param (or missing) → bare /results.
  const fromRaw = typeof sp.from === 'string' ? sp.from : '';
  const backHref = fromRaw ? `/results?${fromRaw}` : '/results';

  // Auth gate — only authenticated students view listing detail. The
  // SEO metadata + JSON-LD live in the layout and still get served to
  // crawlers; this only replaces the page body.
  const auth = await requireStudent();
  if (!auth) {
    const fromQs = fromRaw ? `?from=${encodeURIComponent(fromRaw)}` : '';
    const localePrefix = locale === 'el' ? '' : `/${locale}`;
    const nextPath = `${localePrefix}/listing/${id}${fromQs}`;
    return <AuthGate next={nextPath} />;
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
    listing.verified_tier && listing.verified_tier !== 'none';

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

// Pick up to 3 destination rows for the listing detail's distance table.
// Match by faculty_id (stable across locales / display-name drift) — the
// original fuzzy 'medic'/'ιατρ' match silently missed once AUTH Medical
// School was seeded as "Faculty of Health Sciences".
//
// The committed seed (migrations/002_seed_faculties.sql) ships
// auth-main / auth-medical / auth-agriculture. Production has been
// extended via MCP with auth-philosophy / auth-engineering / etc. We
// chain fallbacks so this works in both environments. Dedicated AHEPA
// hospital / Central Library reference points don't exist yet, so we
// drop the abstract "destHospital" row when its data would just be a
// dupe of School of Medicine, and fall back to surfacing the next-
// nearest unique faculty by its real name. That avoids the duplicate-
// row UX the previous fuzzy-match approach was hiding.
function deriveDestinations(facultyDistances, t) {
  const byId = (id) => facultyDistances.find((f) => f.faculty_id === id);

  const medicine = byId('auth-medical');
  // Main campus row stands in for "Central Library"; prefer auth-main
  // (committed seed), fall back to a representative main-campus AUTH
  // row in production envs that don't have auth-main.
  const mainCampus =
    byId('auth-main') ||
    byId('auth-philosophy') ||
    byId('auth-engineering') ||
    byId('auth-law');

  const seen = new Set();
  const picks = [];

  if (medicine) {
    picks.push({
      name: t('destSchool'),
      walk: medicine.walk_minutes,
      transit: medicine.transit_minutes,
    });
    seen.add(medicine.faculty_id);
  }
  if (mainCampus && !seen.has(mainCampus.faculty_id)) {
    picks.push({
      name: t('destLibrary'),
      walk: mainCampus.walk_minutes,
      transit: mainCampus.transit_minutes,
    });
    seen.add(mainCampus.faculty_id);
  }

  // Pad to 3 rows with the next-nearest unique faculty under its real
  // (localised) name. Sorted by walk time; ties broken by transit.
  const remaining = [...facultyDistances]
    .filter((f) => !seen.has(f.faculty_id))
    .sort(
      (a, b) =>
        (a.walk_minutes ?? Infinity) - (b.walk_minutes ?? Infinity) ||
        (a.transit_minutes ?? Infinity) - (b.transit_minutes ?? Infinity)
    );
  for (const f of remaining) {
    if (picks.length >= 3) break;
    picks.push({
      name: f.faculty_name,
      walk: f.walk_minutes,
      transit: f.transit_minutes,
    });
    seen.add(f.faculty_id);
  }

  return picks;
}
