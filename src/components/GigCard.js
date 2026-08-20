'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import GigFavoriteButton from '@/components/GigFavoriteButton';
import { formatMoney } from '@/lib/formatMoney';

/*
  Holiday Gigs card — sibling of ListingCard, trimmed for jobs. Shows role,
  employer, country, pay (or "Unpaid"), start date and length. The whole card
  is a stretched link to the gig detail page.
*/

function isValidPhotoUrl(url) {
  return typeof url === 'string' && url.startsWith('http');
}

function formatPay(gig, periodLabels) {
  if (!gig.is_paid) return null;
  if (gig.pay_amount == null) return null;
  const period = periodLabels[gig.pay_period] ?? periodLabels.month;
  return `${formatMoney(gig.pay_amount, gig.currency)}${period}`;
}

export default function GigCard({ gig, fromQuery = '' }) {
  const t = useTranslations('gigs.card');
  const photo = gig.photos?.find(isValidPhotoUrl);

  const periodLabels = {
    hour: t('perHour'),
    week: t('perWeek'),
    month: t('perMonth'),
    total: t('total'),
  };
  const pay = formatPay(gig, periodLabels);

  const href = fromQuery
    ? `/gigs/${gig.gig_id}?from=${encodeURIComponent(fromQuery)}`
    : `/gigs/${gig.gig_id}`;

  const startDate = gig.available_from
    ? new Date(gig.available_from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  return (
    /* Same borderless photo-as-card frame as ListingCard — the two grids sit
       in the same design system and would read as two systems otherwise. */
    <div className="group relative transition-transform hover:-translate-y-0.5">
      {/* Photo — this IS the card frame now */}
      <div className="relative aspect-[4/3] rounded-photo overflow-hidden bg-parchment">
        <span className="absolute top-3 right-3 z-10">
          <Pill variant={gig.is_paid ? 'verified' : 'info'}>
            {gig.is_paid ? t('paid') : t('unpaid')}
          </Pill>
        </span>
        {photo ? (
          <Image
            src={photo}
            alt={gig.title}
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
      <div className="pt-3">
        <p className="label-caps text-night/50">
          {gig.country_flag ? `${gig.country_flag} ` : ''}
          {[gig.city, gig.country_name].filter(Boolean).join(' · ')}
        </p>
        <h3 className="mt-1.5 font-display text-2xl text-night leading-tight line-clamp-2">
          {gig.title}
        </h3>
        {gig.employer_name && (
          <p className="mt-1 text-sm text-night/60 line-clamp-1">{gig.employer_name}</p>
        )}

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="label-caps text-night/60">
            {startDate ? t('startsFrom', { date: startDate }) : ''}
          </span>
          <span className="font-display text-xl text-blue">
            {pay ? (
              pay
            ) : (
              <span className="text-sm text-night/50">
                {gig.is_paid ? t('payOnApplication') : t('unpaid')}
              </span>
            )}
          </span>
        </div>

        {gig.min_duration_weeks != null && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Pill variant="amenity">{t('weeks', { weeks: gig.min_duration_weeks })}</Pill>
          </div>
        )}
      </div>

      {/* Stretched link → gig detail */}
      <Link
        href={href}
        aria-label={gig.title}
        className="absolute inset-0 z-0 rounded-photo focus-visible:outline-2 outline-yellow focus-visible:outline-yellow focus-visible:outline-offset-2"
      />

      {/* Save toggle — over the photo's top-left, above the stretched link.
          The right corner is reserved for the Paid/Unpaid badge. */}
      <GigFavoriteButton gigId={gig.gig_id} className="absolute top-3 left-3 z-10" />
    </div>
  );
}
