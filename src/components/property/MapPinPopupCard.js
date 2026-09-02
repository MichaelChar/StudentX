'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';
import { formatMoney } from '@/lib/formatMoney';

/*
  Compact pin-hover card. Intentionally has no <a> or button — the map
  parent owns click-through, and an inner link would steal the event.
*/

function isValidPhotoUrl(url) {
  return typeof url === 'string' && url.startsWith('http');
}

export default function MapPinPopupCard({ listing }) {
  const tCard = useTranslations('listingCard');
  const photo = (listing.photos ?? []).find(isValidPhotoUrl);
  const title = listing.title || listing.neighborhood;

  return (
    <div className="w-[220px]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-photo bg-parchment">
        {photo ? (
          <Image
            src={photo}
            alt={title || ''}
            fill
            className="object-cover"
            sizes="220px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-night/20">
            <Icon name="photo" className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="pt-3">
        {listing.neighborhood ? (
          <p className="label-caps text-night/50">{listing.neighborhood}</p>
        ) : null}
        <h3 className="mt-1.5 font-display text-2xl leading-tight text-night line-clamp-2">
          {title}
        </h3>
        <p className="mt-2 font-display text-xl text-blue">
          {listing.monthly_price != null ? (
            <>
              {formatMoney(listing.monthly_price, listing.currency)}
              <span className="text-sm text-night/50">{tCard('perMonth')}</span>
            </>
          ) : (
            <span className="text-sm text-night/50">{tCard('priceOnRequest')}</span>
          )}
        </p>
      </div>
    </div>
  );
}
