import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import FavoriteButton from '@/components/FavoriteButton';
import LandlordAvatar from '@/components/landlord/LandlordAvatar';
import { variantUrl } from '@/lib/photoVariants';
import { formatPropertyType } from '@/lib/propertyType';

/*
  Propylaea listing card — matches page 06 of the reference design.
  Parchment frame, photo with gold verified seal overlay, small-caps
  neighborhood, EB Garamond address, type + price row, amenity pills.

  Link structure: the whole card is a "stretched link" to the listing (an
  absolute overlay, z-0), so the card stays fully clickable while still letting
  TWO independent links live on top of it without nesting <a>s — the verified
  landlord chip (→ landlord profile) and the favorite toggle, both z-10.
*/

function isValidPhotoUrl(url) {
  return typeof url === 'string' && url.startsWith('http');
}

export default function ListingCard({ listing, fromQuery = '', groundFloorDealbreaker = false }) {
  const t = useTranslations('propylaea.results');
  const tCard = useTranslations('listingCard');
  const locale = useLocale();
  const photo = listing.photos?.find(isValidPhotoUrl);
  // When the student set "no ground floor" but this listing has no recorded
  // floor, flag it so they ask before viewing rather than discovering on the
  // day (NULL floors are kept in results, not filtered out — see #100).
  const floorUnspecified = groundFloorDealbreaker && listing.floor == null;
  const isVerified =
    listing.verified_tier &&
    listing.verified_tier !== 'none' &&
    listing.is_verified === true;

  // Thread current results search-state into the listing URL so the
  // detail page's back link returns to the same filtered view. Caller
  // passes the encoded query string (without the leading "?").
  const href = fromQuery
    ? `/property/thessaloniki/listing/${listing.listing_id}?from=${encodeURIComponent(fromQuery)}`
    : `/property/thessaloniki/listing/${listing.listing_id}`;

  // landlord_id is the first 4 chars of every listing_id (LLLLNNN — see
  // docs/schema.md), so the profile link needs no extra field. The chip only
  // renders for verified landlords (profiles are a verified-tier perk).
  const landlordId = listing.listing_id?.slice(0, 4);
  const landlordName = listing.landlord?.name;
  const showLandlord = isVerified && landlordId && landlordName;

  return (
    <div
      className={`group relative bg-white rounded-sm overflow-hidden transition-all ${
        isVerified
          ? 'border-2 border-yellow/60 shadow-[0_0_12px_-2px_rgba(255,203,87,0.4)] hover:shadow-[0_0_18px_-2px_rgba(255,203,87,0.55)]'
          : 'border border-night/10 hover:border-blue/40 hover:shadow-[0_2px_18px_-8px_rgba(10,20,54,0.25)]'
      }`}
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] bg-parchment">
        {isVerified && (
          <span className="absolute top-3 right-3 z-10">
            <Pill variant="verified">{tCard('verified')}</Pill>
          </span>
        )}
        {photo ? (
          <Image
            src={variantUrl(photo, 'card')}
            alt={listing.address}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-night/20">
            <Icon name="photo" className="w-10 h-10" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        <p className="label-caps text-night/50">
          {listing.neighborhood} &middot; Thessaloniki
        </p>
        <h3 className="mt-1.5 font-display text-2xl text-night leading-tight line-clamp-2">
          {listing.title || listing.address}
        </h3>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="label-caps text-night/60">
            {formatPropertyType(listing.property_type, locale)}
          </span>
          <span className="font-display text-xl text-blue">
            {listing.monthly_price != null ? (
              <>
                €{listing.monthly_price}
                <span className="text-sm text-night/50">
                  {tCard('perMonth')}
                </span>
              </>
            ) : (
              <span className="text-sm text-night/50">
                {tCard('priceOnRequest')}
              </span>
            )}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {floorUnspecified && (
            <Pill variant="info">{t('floorNotSpecified')}</Pill>
          )}
          {listing.bills_included && (
            <Pill variant="amenity">{t('billsIncluded')}</Pill>
          )}
        </div>

        {/* Verified landlord chip — its own link (z-10) above the stretched
            card link, so a tap here opens the landlord profile, not the listing. */}
        {showLandlord && (
          <Link
            href={`/property/thessaloniki/landlords/${landlordId}`}
            className="relative z-10 mt-4 inline-flex max-w-full items-center gap-2 group/landlord focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2 rounded-sm"
          >
            <LandlordAvatar
              name={landlordName}
              photoUrl={listing.landlord?.profile_photo_url}
              size={28}
            />
            <span className="label-caps text-night/55 truncate group-hover/landlord:text-blue transition-colors">
              {tCard('listedBy', { name: landlordName })}
            </span>
          </Link>
        )}
      </div>

      {/* Primary stretched link → listing detail. Transparent overlay covering
          the whole card; sits below the chip/favorite (z-0 vs z-10). */}
      <Link
        href={href}
        aria-label={listing.title || listing.address}
        className="absolute inset-0 z-0 rounded-sm focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
      />

      {/* Save toggle — over the photo's top-left, above the stretched link.
          Right corner is reserved for the verified seal. */}
      <FavoriteButton
        listingId={listing.listing_id}
        className="absolute top-3 left-3 z-10"
      />
    </div>
  );
}
