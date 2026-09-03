import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

import { getListingForRender, getSimilarListings } from '@/lib/listingForRender';
import { requireStudent } from '@/lib/requireStudent';

import ListingGallery from '@/components/listing/ListingGallery';
import BookingWidget from '@/components/listing/BookingWidget';
import AvailabilityCalendar from '@/components/listing/AvailabilityCalendar';
import ViewTracker from '@/components/listing/ViewTracker';
import VisitedTracker from '@/components/listing/VisitedTracker';
import ReportListingModal from '@/components/listing/ReportListingModal';
import PropertyVerifiedBadge from '@/components/listing/PropertyVerifiedBadge';
import ListingHighlights from '@/components/listing/ListingHighlights';
import WhereYoullBe from '@/components/listing/WhereYoullBe';
import MeetYourHostSection from '@/components/listing/MeetYourHostSection';
import HowPayingWorks from '@/components/listing/HowPayingWorks';
import PaymentSafetyNotice from '@/components/listing/PaymentSafetyNotice';
import FavoriteButton from '@/components/FavoriteButton';
import ListingCard from '@/components/ListingCard';
import LandlordAvatar from '@/components/landlord/LandlordAvatar';
import Pill from '@/components/ui/Pill';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { formatPropertyType } from '@/lib/propertyType';
import { formatDistance } from '@/lib/formatDistance';
import { formatMoney } from '@/lib/formatMoney';
import { CANCELLATION_TIERS } from '@/lib/cancellationPolicy';
import { deriveListingHighlights } from '@/lib/listingHighlights';
import {
  responseTimeBucket,
  RESPONSE_BUCKET_WITHIN_HOUR,
  RESPONSE_BUCKET_WITHIN_DAY,
  RESPONSE_BUCKET_WITHIN_2_DAYS,
} from '@/lib/responseTimeBucket';

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

  /*
    Stay dates the student picked on results, recovered from `from=`.
    Shape-validated only (YYYY-MM-DD); BookingWidget re-parses and re-validates
    before it will submit anything, so a malformed value here can at worst
    prefill a field the student then corrects.
  */
  const stayFromResults = (() => {
    if (!fromRaw) return { moveIn: '', moveOut: '' };
    let params;
    try {
      params = new URLSearchParams(fromRaw);
    } catch {
      return { moveIn: '', moveOut: '' };
    }
    const ymd = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
    return {
      moveIn: ymd(params.get('move_in')),
      moveOut: ymd(params.get('move_out')),
    };
  })();

  const auth = await requireStudent();
  const isAuthed = auth && auth.kind !== 'wrong-role';

  const listing = await getListingForRender(id);
  if (!listing) notFound();

  const similarListings = await getSimilarListings(listing);

  const t = await getTranslations({ locale, namespace: 'propylaea.listing' });
  const tListing = await getTranslations({ locale, namespace: 'listing' });
  /*
    The host card's badge is LANDLORD ID VERIFICATION, which this codebase
    labels "SuperLandlord" — the same word the profile page it links to uses.
    Reusing that key rather than adding a second string keeps the two from
    drifting into different words for one thing, and avoids conflating it with
    the separate property-verification badge (Feature 19) or the paid tier.
  */
  const tLandlord = await getTranslations({ locale, namespace: 'propylaea.landlordProfile' });

  /*
    Response time for the host card (Feature 37).

    Derived here rather than reusing Feature 29's highlight row, because the
    two deliberately differ: the highlight is gated to within_hour/within_day
    only — "replies within two days" is an apology, not a selling point — while
    "who is this person" is a fair place to state it plainly. Same bucketer,
    different editorial rule, which is why this is not shared code.

    Null (unknown or stale) means the card omits the line entirely.
  */
  const hostResponseBucket = responseTimeBucket(
    listing.avg_response_ms,
    listing.response_stats_at,
  );
  const hostResponseLabel =
    hostResponseBucket === RESPONSE_BUCKET_WITHIN_HOUR
      ? t('responseWithinHour')
      : hostResponseBucket === RESPONSE_BUCKET_WITHIN_DAY
        ? t('responseWithinDay')
        : hostResponseBucket === RESPONSE_BUCKET_WITHIN_2_DAYS
          ? t('responseWithin2Days')
          : null;

  /*
    Feature 29 — listing highlights.

    `?faculty=` carries the student's own faculty through from the commute
    filter (S15) and the quiz, so the commute row can name THEIR faculty
    rather than whichever happens to be nearest. See lib/listingHighlights.js.

    Translated here rather than in the component: this is a server component
    with getTranslations, and keeping the renderer copy-free means it stays a
    dumb presentational stack.
  */
  const highlightRows = deriveListingHighlights(listing, {
    selectedFacultyId: typeof sp.faculty === 'string' ? sp.faculty : null,
  }).map((row) => ({
    icon: row.icon,
    title: t(row.title.key, row.title.params),
    subtitle: row.subtitle ? t(row.subtitle.key, row.subtitle.params) : null,
  }));

  const photos = (listing.photos || []).filter(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );
  // Free admin-approved verification. Gates the "listed by" profile link
  // (public landlord profiles require is_verified).
  const isVerified = listing.is_verified === true;

  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-28 sm:pb-12 md:py-12">
      {isAuthed && <ViewTracker listingId={listing.listing_id} />}
      {/* Local-only "you have looked at this" record, driving the visited map
          pin on the results page (parity Feature 12). Unconditional, unlike
          ViewTracker above — see the component for why the two are separate. */}
      <VisitedTracker listingId={listing.listing_id} />

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
            mosaic
            photos={photos}
            title={listing.title || listing.neighborhood || 'Listing'}
          />
        ) : (
          <div className="aspect-[16/9] rounded-photo bg-parchment flex items-center justify-center">
            <Icon name="photo" className="w-16 h-16 text-night/20" />
          </div>
        )}
      </section>

      {/* Main content */}
      {/* Feature 33 — the booking column is 373px, the measured width of
          Airbnb's sticky card. Was 340px. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_373px] gap-10">
        {/* Left column */}
        <div>
          {/* Hero stripe — address */}
          <div className="flex flex-col md:flex-row md:items-start gap-5 mb-8">
            <div className="flex-1">
              <p className="label-caps text-night/50">
                {listing.neighborhood} &middot; Thessaloniki
              </p>
              <h1 className="mt-1 font-display text-4xl md:text-5xl text-night leading-tight text-balance">
                {listing.title || listing.neighborhood}
              </h1>
              {/*
                Renders only when a caller asked for the precise address.
                transformListing withholds it by default, so pre-booking this
                is absent and the neighbourhood line above carries the
                location. Kept rather than deleted: this is where the address
                belongs once a confirmed booking reveals it.
              */}
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
              className="group inline-flex items-center gap-3 mb-10 rounded-control focus-visible:outline-2 outline-yellow focus-visible:outline-yellow focus-visible:outline-offset-2"
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

          {/*
            Feature 29 — highlights, positioned under the host row exactly as
            the reference has them.

            This REPLACES the standalone "Usually replies within an hour" line
            that used to sit under the address. Keeping both would have printed
            the same fact twice, ~200px apart, which is what building this
            surfaced. One consequence worth knowing: the old line also covered
            the `within_2_days` bucket and the highlight row deliberately does
            not — per the spec, "replies within two days" is an apology, not a
            highlight — so that case is no longer surfaced anywhere. Reversible
            in one line if you disagree.
          */}
          <ListingHighlights rows={highlightRows} />

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

          {/*
            Feature 36 — "Where you'll be".

            Sits directly under the university distances so the location story
            reads as one block: the map says roughly where, the distances say
            how far. Airbnb puts its equivalent after amenities, but the
            distances are this audience's version of the same question and
            splitting them would leave the map floating.

            An approximate CIRCLE, never a pin. transformListing already
            withholds the street address and coarsens the coordinates (#452);
            this section is the visible half of that promise, and the caption
            says outright when the exact address arrives.
          */}
          <section className="mb-10">
            <WhereYoullBe
              lat={listing.lat}
              lng={listing.lng}
              heading={t('whereYoullBeHeading')}
              caption={t('whereYoullBeCaption')}
            />
          </section>

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

          {/*
            Feature 37 — "Meet your host", low on the page as the spec places
            it. A student handing over a deposit and living in someone's
            property for nine months should not have to leave the listing to
            find out who they are.

            The profile link is gated on is_verified because that page 404s for
            unverified landlords — passing null means the card renders without
            a link rather than offering a broken one.

            Response time also appears in Feature 29's highlights near the top.
            That duplication is deliberate and unlike the one removed in #449:
            these are far apart and answer different questions — the highlight
            is a scannable fact, this is part of "who is this person". The
            reference does the same.
          */}
          <section className="mb-10">
            <MeetYourHostSection
              heading={t('meetHostHeading')}
              name={listing.landlord?.name}
              photoUrl={listing.landlord?.profile_photo_url}
              verified={isVerified}
              verifiedLabel={tLandlord('verified')}
              responseLabel={hostResponseLabel}
              profileHref={
                isVerified
                  ? `/property/thessaloniki/landlords/${listing.listing_id.slice(0, 4)}`
                  : null
              }
              messageLabel={t('meetHostMessage')}
              profileLabel={t('meetHostProfile')}
              /*
                Feature 38 — the off-platform warning, under Message host.
                That is where the temptation actually occurs: opening a thread
                is the moment a scammer moves a student to WhatsApp.

                The held-money explanation is NOT repeated here — "How paying
                works" carries it, immediately below. The spec's third
                placement (beside the booking CTA) would print these same two
                sentences a second time on one page, and the booking card is
                sticky so both could be on screen at once.
              */
              footer={<PaymentSafetyNotice body={t('offPlatformWarning')} />}
            />
          </section>

          {/*
            Feature 47 — "How paying works".

            Directly after the host section, as the spec places it. It answers
            the questions the booking card leaves open — what do I pay now, who
            holds it, when does the landlord get it — without sending a student
            off the listing mid-decision.

            This section carries the held-money explanation, which is why
            Feature 38's notice under "Message host" is the off-platform
            warning alone: the two would otherwise print the same three
            sentences twice on one page.

            Step 3 is the trimmed version, by founder decision (2026-09-03).
            The spec recommends restoring the deposit clause; the deposit is
            already shown in the field grid above.
          */}
          <section className="mb-10">
            <HowPayingWorks
              heading={t('howPayingHeading')}
              steps={[
                { label: t('howPayingStep1Label'), body: t('howPayingStep1') },
                { label: t('howPayingStep2Label'), body: t('howPayingStep2') },
                { label: t('howPayingStep3Label'), body: t('howPayingStep3') },
              ]}
            />
          </section>

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
        {/*
          Feature 33 — the dates the student already chose on results are
          threaded here inside `from=` (which carries the whole results query
          string, for the back link). Reading them out means the booking card
          opens pre-filled instead of asking for a stay range the student
          entered one page ago.

          Parsed from `from` rather than adding new top-level params: the
          value is already there, and a second copy of the same dates in the
          URL is two things to keep in sync.
        */}
        <BookingWidget
          initialMoveIn={stayFromResults.moveIn}
          initialMoveOut={stayFromResults.moveOut}
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
