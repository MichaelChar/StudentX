import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

import { getListingForRender, getSimilarListings } from '@/lib/listingForRender';
import { requireStudent } from '@/lib/requireStudent';

import ListingGallery from '@/components/listing/ListingGallery';
import BookingWidget from '@/components/listing/BookingWidget';
import AvailabilityCalendar from '@/components/listing/AvailabilityCalendar';
import ViewTracker from '@/components/listing/ViewTracker';
import ReportListingModal from '@/components/listing/ReportListingModal';
import PropertyVerifiedBadge from '@/components/listing/PropertyVerifiedBadge';
import FavoriteButton from '@/components/FavoriteButton';
import ListingCard from '@/components/ListingCard';
import LandlordAvatar from '@/components/landlord/LandlordAvatar';
import Pill from '@/components/ui/Pill';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { formatPropertyType } from '@/lib/propertyType';
import { formatDistance } from '@/lib/formatDistance';
import { formatMoney } from '@/lib/formatMoney';
import {
  responseTimeBucket,
  RESPONSE_BUCKET_WITHIN_HOUR,
  RESPONSE_BUCKET_WITHIN_DAY,
  RESPONSE_BUCKET_WITHIN_2_DAYS,
} from '@/lib/responseTimeBucket';
import { CANCELLATION_TIERS } from '@/lib/cancellationPolicy';

const CANCELLATION_COPY_KEY = {
  free: 'cancellationFree',
  half: 'cancellationHalf',
};

// Cap on the untrusted ?from= URL param. Real /results querystrings are
// well under this; anything bigger is almost certainly an attempt to
// stuff oversized payloads into the back-link / AuthGate redirect.
const MAX_FROM_LENGTH = 512;

export default async function ListingPage({ params, searchParams }) {
  const { locale, id } = await params;
  const sp = (await searchParams) || {};
  setRequestLocale(locale);

  const fromRawInput = typeof sp.from === 'string' ? sp.from : '';
  const fromRaw =
    fromRawInput && fromRawInput.length <= MAX_FROM_LENGTH ? fromRawInput : '';
  const backHref = fromRaw ? `/property/thessaloniki/results?${fromRaw}` : '/property/thessaloniki/results';

  const auth = await requireStudent();
  const isAuthed = auth && auth.kind !== 'wrong-role';

  const listing = await getListingForRender(id);
  if (!listing) notFound();

  const similarListings = await getSimilarListings(listing);

  const t = await getTranslations({ locale, namespace: 'propylaea.listing' });
  const tListing = await getTranslations({ locale, namespace: 'listing' });

  const photos = (listing.photos || []).filter(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );
  // Free admin-approved verification. Gates the "listed by" profile link
  // (public landlord profiles require is_verified).
  const isVerified = listing.is_verified === true;

  const responseBucket = responseTimeBucket(
    listing.avg_response_ms,
    listing.response_stats_at,
  );
  const responseLabelKey =
    responseBucket === RESPONSE_BUCKET_WITHIN_HOUR
      ? 'responseWithinHour'
      : responseBucket === RESPONSE_BUCKET_WITHIN_DAY
        ? 'responseWithinDay'
        : responseBucket === RESPONSE_BUCKET_WITHIN_2_DAYS
          ? 'responseWithin2Days'
          : null;

  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-28 sm:pb-12 md:py-12">
      {isAuthed && <ViewTracker listingId={listing.listing_id} />}

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

      {/* Photo gallery — inline main image + thumbnail strip → lightbox */}
      <section className="mb-10">
        {photos.length > 0 ? (
          <ListingGallery
            photos={photos}
            title={listing.title || listing.address || 'Listing'}
          />
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
          {/* Hero stripe — address */}
          <div className="flex flex-col md:flex-row md:items-start gap-5 mb-8">
            <div className="flex-1">
              <p className="label-caps text-night/50">
                {listing.neighborhood} &middot; Thessaloniki
              </p>
              <h1 className="mt-1 font-display text-4xl md:text-5xl text-night leading-tight text-balance">
                {listing.title || listing.address}
              </h1>
              {listing.address && (
                <p
                  className="mt-2 label-caps text-night/60"
                  aria-label={t('streetAddressA11y')}
                >
                  {listing.address}
                </p>
              )}
              {listing.property_verified && listing.property_verification && (
                <div className="mt-3">
                  <PropertyVerifiedBadge
                    verification={listing.property_verification}
                  />
                </div>
              )}
              {responseLabelKey && (
                <p className="mt-3 text-sm text-night/55 font-sans">
                  {t(responseLabelKey)}
                </p>
              )}
            </div>

            {/* Save / shortlist toggle. Renders for everyone — a
                signed-out tap opens the sign-in gate (FavoritesProvider). */}
            <FavoriteButton
              listingId={listing.listing_id}
              withLabel
              className="md:self-start shrink-0"
            />
          </div>

          {/* Listed by — verified landlords link to their public profile.
              landlord_id is the first 4 chars of the listing_id (see schema). */}
          {isVerified && listing.landlord?.name && (
            <Link
              href={`/property/thessaloniki/landlords/${listing.listing_id.slice(0, 4)}`}
              className="group inline-flex items-center gap-3 mb-10 rounded-sm focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
            >
              <LandlordAvatar
                name={listing.landlord.name}
                photoUrl={listing.landlord.profile_photo_url}
                size={48}
              />
              <span className="leading-tight">
                <span className="label-caps text-night/50 block">
                  {t('listedBy')}
                </span>
                <span className="font-display text-xl text-night group-hover:text-blue transition-colors">
                  {listing.landlord.name}
                </span>
              </span>
            </Link>
          )}

          {/* Field grid — rent, deposit, type + marketplace fields */}
          <Card tone="parchment" border={false} className="p-6 md:p-8 mb-10">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <BilingualField
                english={t('rentEnglish')}
                value={
                  listing.monthly_price != null ? (
                    <>
                      {formatMoney(listing.monthly_price, listing.currency)}
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
                english={t('depositEnglish')}
                value={
                  listing.deposit != null && listing.deposit > 0
                    ? formatMoney(listing.deposit, listing.currency)
                    : '—'
                }
              />
              <BilingualField
                english={t('typeEnglish')}
                value={formatPropertyType(listing.property_type, locale)}
              />
              <BilingualField
                english={t('billsEnglish')}
                value={
                  listing.bills_included
                    ? tListing('billsIncluded')
                    : tListing('billsNotIncluded')
                }
              />
              <BilingualField
                english={t('minDurationEnglish')}
                value={
                  listing.min_duration_months != null
                    ? t('minDurationValue', { n: listing.min_duration_months })
                    : '—'
                }
              />
              <BilingualField
                english={t('sqmEnglish')}
                value={listing.sqm != null ? t('sqmValue', { n: listing.sqm }) : '—'}
              />
              <BilingualField
                english={t('floorEnglish')}
                value={listing.floor != null ? String(listing.floor) : '—'}
              />
              <BilingualField
                english={t('bedroomsEnglish')}
                value={listing.bedrooms != null ? String(listing.bedrooms) : '—'}
              />
              <BilingualField
                english={t('bathroomsEnglish')}
                value={listing.bathrooms != null ? String(listing.bathrooms) : '—'}
              />
            </dl>
          </Card>

          {/* Description */}
          {listing.description && (
            <section className="mb-10">
              <p className="label-caps text-night/80 mb-4">
                {t('descriptionEnglish')}
              </p>
              <p className="text-night/80 leading-relaxed text-lg font-sans">
                {listing.description}
              </p>
            </section>
          )}

          {/* House rules */}
          {(listing.smoking_allowed != null ||
            listing.pets_allowed != null ||
            listing.additional_rules) && (
            <section className="mb-10">
              <p className="label-caps text-night/80 mb-4">{t('houseRulesEnglish')}</p>
              <ul className="space-y-2 text-night/80 text-lg font-sans">
                {listing.smoking_allowed != null && (
                  <li>
                    {listing.smoking_allowed
                      ? t('smokingAllowed')
                      : t('smokingNotAllowed')}
                  </li>
                )}
                {listing.pets_allowed != null && (
                  <li>
                    {listing.pets_allowed ? t('petsAllowed') : t('petsNotAllowed')}
                  </li>
                )}
                {listing.additional_rules && (
                  <li className="leading-relaxed">{listing.additional_rules}</li>
                )}
              </ul>
            </section>
          )}

          {/* Availability calendar */}
          <AvailabilityCalendar listingId={listing.listing_id} />

          {/* Distance to universities — every university the landlord filled
              in, nearest first (sorted in transformListing). The caption is
              deliberate: this number is typed by the landlord, not measured by
              us, and the copy should not imply otherwise. */}
          {listing.university_distances?.length > 0 && (
            <section className="mb-10">
              <p className="label-caps text-night/80 mb-1">
                {t('universityDistancesEnglish')}
              </p>
              <p className="text-sm text-night/50 mb-4">
                {t('universityDistancesSource')}
              </p>
              <dl className="flex flex-wrap gap-x-10 gap-y-4">
                {listing.university_distances.map((u) => (
                  <div key={u.university_id}>
                    {/* Not label-caps: it would uppercase "UoM" to "UOM". */}
                    <dt className="text-[0.7rem] font-semibold tracking-[0.18em] text-night/50">
                      {u.short_name}
                    </dt>
                    <dd className="font-display text-2xl text-night">
                      {formatDistance(u.distance_meters)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Amenities */}
          {listing.amenities?.length > 0 && (
            <section className="mb-10">
              <p className="label-caps text-night/80 mb-4">
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

          {/* Cancellation policy — display only. */}
          <section className="mb-10">
            <p className="label-caps text-night/80 mb-4">
              {t('cancellationEnglish')}
            </p>
            <Card tone="parchment" border={false} className="p-6 md:p-8">
              <ul className="space-y-2 text-night/80 text-lg font-sans">
                {CANCELLATION_TIERS.map((tier) => (
                  <li key={tier.id}>{t(CANCELLATION_COPY_KEY[tier.id])}</li>
                ))}
              </ul>
            </Card>
          </section>

          {/* Subtle "report this listing" trigger — opens a client modal that
              emails the ops inbox (email-only v1, no DB). Rendered here on the
              page, not inside a shared detail component. */}
          <div className="mt-4">
            <ReportListingModal listingId={listing.listing_id} />
          </div>
        </div>

        {/* Right column — booking widget for everyone (gate only on submit). */}
        <BookingWidget
          listing={listing}
          nextPath={`/property/thessaloniki/listing/${listing.listing_id}${fromRaw ? `?from=${encodeURIComponent(fromRaw)}` : ''}`}
        />
      </div>

      {/* Similar listings — same neighbourhood first, then nearest price. */}
      {similarListings.length > 0 && (
        <section className="mt-16 md:mt-20">
          <p className="label-caps text-night/80 mb-6">
            {t('similarEnglish')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {similarListings.map((similar) => (
              <ListingCard key={similar.listing_id} listing={similar} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BilingualField({ english, value }) {
  return (
    <div>
      <dt>
        <span className="label-caps text-night/80 block">
          {english}
        </span>
      </dt>
      <dd className="mt-2 font-display text-2xl text-night leading-tight">
        {value}
      </dd>
    </div>
  );
}
