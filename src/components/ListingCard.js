import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isEstimatedPrice } from '@/lib/estimatedListings';

function isValidPhotoUrl(url) {
  return typeof url === 'string' && url.startsWith('http');
}

export default function ListingCard({ listing, faculty }) {
  const t = useTranslations('listingCard');
  const photo = listing.photos?.find(isValidPhotoUrl);
  const distance = listing.faculty_distances?.[0];

  return (
    <Link
      href={`/listing/${listing.listing_id}`}
      className={`group block rounded-xl border bg-white overflow-hidden hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${listing.is_featured ? 'border-gold/40 shadow-sm' : 'border-gray-200'}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-gray-light">
        {listing.is_featured && (
          <span className="absolute top-2 left-2 z-10 bg-gold text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
            {t('featured')}
          </span>
        )}
        {photo ? (
          <Image
            src={photo}
            alt={listing.address}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-dark/30">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Price + type */}
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-heading text-xl font-bold text-navy">
            {listing.monthly_price != null ? (
              <>{isEstimatedPrice(listing.listing_id) && <span className="text-sm font-normal text-gray-dark/50">{t('estimated')}</span>}&euro;{listing.monthly_price}<span className="text-sm font-normal text-gray-dark/50">{t('perMonth')}</span></>
            ) : (
              <span className="text-sm font-normal text-gray-dark/50">{t('priceOnRequest')}</span>
            )}
          </span>
          <span className="text-xs text-gray-dark/60 capitalize truncate max-w-[50%] text-right">
            {listing.property_type?.replace(/-/g, ' ')}
          </span>
        </div>

        {/* Address */}
        <p className="text-sm text-gray-dark font-medium truncate">
          {listing.address}
        </p>
        <p className="text-xs text-gray-dark/50 mb-3">
          {listing.neighborhood}
        </p>

        {/* Distance */}
        {distance && (
          <p className="text-xs text-gray-dark/60 mb-3">
            <span className="inline-flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              {distance.walk_minutes} {t('walkMin')}
            </span>
            <span className="mx-1.5 text-gray-dark/30">|</span>
            <span>{distance.transit_minutes} {t('transitMin')}</span>
            {faculty && (
              <span className="block mt-0.5 text-gray-dark/40">
                {t('to')} {distance.faculty_name}
              </span>
            )}
          </p>
        )}

        {/* Amenity pills */}
        {listing.amenities?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {listing.amenities.map((amenity) => (
              <span
                key={amenity}
                className="text-[11px] px-2 py-0.5 rounded-full bg-gray-light text-gray-dark/70"
              >
                {amenity}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
