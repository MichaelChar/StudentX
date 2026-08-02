import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import { stayDurationMonths } from '@/lib/bookingDates';
import { variantUrl } from '@/lib/photoVariants';

function isValidPhotoUrl(url) {
  return typeof url === 'string' && url.startsWith('http');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function statusVariant(state) {
  if (state === 'requested') return 'pending';
  if (state === 'accepted' || state === 'confirmed') return 'info';
  if (state === 'disputed') return 'pending';
  return 'amenity';
}

/**
 * List-row card for one student booking (server component).
 */
export default async function StudentBookingCard({ booking, locale }) {
  const t = await getTranslations({ locale, namespace: 'student.bookings' });

  const listing = Array.isArray(booking.listings)
    ? booking.listings[0]
    : booking.listings;
  const loc = Array.isArray(listing?.location)
    ? listing.location[0]
    : listing?.location;
  const photos = listing?.photos;
  const photo = Array.isArray(photos) ? photos.find(isValidPhotoUrl) : null;
  const title = listing?.title || loc?.address || booking.listing_id;
  const neighborhood = loc?.neighborhood;
  const months = stayDurationMonths(booking.move_in, booking.move_out);

  return (
    <li>
      <Card tone="white" className="p-5 md:p-6">
        <div className="flex gap-4 md:gap-5">
          <div className="relative w-24 h-24 md:w-28 md:h-28 shrink-0 rounded-sm overflow-hidden bg-parchment border border-night/10">
            {photo ? (
              <Image
                src={variantUrl(photo, 'card')}
                alt=""
                fill
                className="object-cover"
                sizes="112px"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-night/30">
                <Icon name="photo" className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-display text-xl text-night truncate">{title}</p>
                {neighborhood && (
                  <p className="label-caps text-night/50 mt-0.5">{neighborhood}</p>
                )}
              </div>
              <Pill variant={statusVariant(booking.state)}>
                {t(`state_${booking.state}`)}
              </Pill>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
              <div>
                <dt className="label-caps text-night/50">{t('colMoveIn')}</dt>
                <dd className="mt-0.5 text-night">{formatDate(booking.move_in)}</dd>
              </div>
              <div>
                <dt className="label-caps text-night/50">{t('colMoveOut')}</dt>
                <dd className="mt-0.5 text-night">{formatDate(booking.move_out)}</dd>
              </div>
              <div>
                <dt className="label-caps text-night/50">{t('colDuration')}</dt>
                <dd className="mt-0.5 text-night">
                  {months != null ? t('durationMonths', { n: months }) : '—'}
                </dd>
              </div>
              <div>
                <dt className="label-caps text-night/50">{t('colRent')}</dt>
                <dd className="mt-0.5 font-display text-lg text-blue">
                  €{booking.monthly_rent}
                  <span className="text-xs text-night/50 font-sans">/mo</span>
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <Link
                href={`/student/account/bookings/${booking.booking_id}`}
                className="label-caps text-blue hover:text-night"
              >
                {t('viewDetails')} →
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </li>
  );
}
