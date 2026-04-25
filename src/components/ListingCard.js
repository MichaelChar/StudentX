import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Pill from '@/components/ui/Pill';
import VerifiedSeal from '@/components/ui/VerifiedSeal';
import Icon from '@/components/ui/Icon';

/*
  Propylaea listing card — matches page 06 of the reference design.
  Parchment frame, photo with gold verified seal overlay, small-caps
  neighborhood, EB Garamond address, type + price row, programme pills.
*/

function isValidPhotoUrl(url) {
  return typeof url === 'string' && url.startsWith('http');
}

export default function ListingCard({ listing }) {
  const t = useTranslations('propylaea.results');
  const tCard = useTranslations('listingCard');
  const photo = listing.photos?.find(isValidPhotoUrl);
  const isVerified =
    listing.verified_tier && listing.verified_tier !== 'none';

  return (
    <Link
      href={`/listing/${listing.listing_id}`}
      className="group block bg-white border border-night/10 rounded-sm overflow-hidden hover:border-blue/40 hover:shadow-[0_2px_18px_-8px_rgba(10,20,54,0.25)] transition-all focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2"
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] bg-parchment">
        {isVerified && (
          <div className="absolute top-3 left-3 z-10">
            <VerifiedSeal size={38} />
          </div>
        )}
        {listing.is_featured && (
          <span className="absolute top-3 right-3 z-10">
            <Pill variant="programme">AUTh programme</Pill>
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
        <h3 className="mt-1.5 font-display text-2xl text-night leading-tight">
          {listing.address}
        </h3>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="label-caps text-night/60">
            {listing.property_type}
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
          {listing.bills_included && (
            <Pill variant="amenity">{t('billsIncluded')}</Pill>
          )}
          {isVerified && <Pill variant="programme">{t('authProgramme')}</Pill>}
        </div>
      </div>
    </Link>
  );
}
