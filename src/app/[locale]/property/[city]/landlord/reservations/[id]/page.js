'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { Link, useRouter } from '@/i18n/navigation';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import GuestProfileCard from '@/components/booking/GuestProfileCard';
import {
  stayDurationMonths,
  stayDurationMonthsExact,
  costSummary,
} from '@/lib/bookingDates';
import { landlordFirstMonthReceive } from '@/lib/bookingFees';

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

function rentDeposit(listing) {
  const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;
  return Number(rent?.deposit) || 0;
}

export default function LandlordReservationDetailPage() {
  const t = useTranslations('propylaea.landlord.reservations');
  const params = useParams();
  const bookingId = params?.id;
  const router = useRouter();

  const [booking, setBooking] = useState(null);
  const [firstContactAt, setFirstContactAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError(t('loadError'));
        setLoading(false);
        return;
      }
      const data = await res.json();
      setBooking(data.booking);
      setFirstContactAt(data.first_contact_at ?? null);
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [bookingId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  async function act(action) {
    setActing(true);
    setError('');
    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('actionError'));
        return;
      }
      setBooking(data.booking);
      await load();
      if (action === 'accept' || action === 'decline') {
        router.refresh();
      }
    } catch {
      setError(t('actionError'));
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <LandlordShell eyebrow={t('eyebrow')} title={t('detailTitle')}>
        <div className="h-40 bg-parchment rounded-sm animate-pulse" />
      </LandlordShell>
    );
  }

  if (!booking) {
    return (
      <LandlordShell eyebrow={t('eyebrow')} title={t('detailTitle')}>
        <Card tone="parchment" className="p-12 text-center">
          <p className="font-display text-xl text-night/60">{t('notFound')}</p>
          <Link
            href="/property/thessaloniki/landlord/reservations"
            className="label-caps text-blue mt-4 inline-block"
          >
            ← {t('back')}
          </Link>
        </Card>
      </LandlordShell>
    );
  }

  const student = Array.isArray(booking.students)
    ? booking.students[0]
    : booking.students;
  const listing = Array.isArray(booking.listings)
    ? booking.listings[0]
    : booking.listings;
  const loc = Array.isArray(listing?.location)
    ? listing.location[0]
    : listing?.location;
  const label = listing?.title || loc?.address || booking.listing_id;
  const months = stayDurationMonths(booking.move_in, booking.move_out);
  const deposit = rentDeposit(listing);
  const cost = costSummary({
    monthlyRent: booking.monthly_rent,
    months: months || 0,
    monthsExact: stayDurationMonthsExact(booking.move_in, booking.move_out),
    deposit,
    agencyFee: listing?.agency_fee,
  });
  // Commission comes out of the held first month's rent, never the deposit —
  // the deposit is the tenant's money and is settled landlord-to-tenant.
  const receive = landlordFirstMonthReceive({
    firstMonthRent: booking.monthly_rent,
    totalStayValue: booking.total_stay_value ?? cost.total_rent,
  });
  const canRespond = booking.state === 'requested';
  const acceptanceAt = booking.accepted_at || booking.confirmed_at || null;

  const timelineRows = [
    {
      key: 'requested',
      label: t('timelineRequested'),
      value: formatDate(booking.created_at),
    },
    {
      key: 'first_contact',
      label: t('timelineFirstContact'),
      value: firstContactAt ? formatDate(firstContactAt) : t('timelineNA'),
    },
    {
      key: 'acceptance',
      label: t('timelineLandlordAcceptance'),
      value: acceptanceAt ? formatDate(acceptanceAt) : t('timelineNA'),
    },
  ];

  return (
    <LandlordShell
      eyebrow={t('eyebrow')}
      title={t('detailTitle')}
      actions={
        <Link
          href="/property/thessaloniki/landlord/reservations"
          className="label-caps text-night/60 hover:text-blue"
        >
          ← {t('back')}
        </Link>
      }
    >
      {error && (
        <p className="text-sm text-magenta bg-parchment border border-night/10 rounded-sm px-4 py-3 mb-6">
          {error}
        </p>
      )}

      <Card tone="white" className="p-6 md:p-8 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="label-caps text-night/50">{label}</p>
            <h2 className="font-display text-2xl md:text-3xl text-night mt-1">
              {student?.display_name || t('unknownStudent')}
            </h2>
          </div>
          <Pill variant={booking.state === 'requested' ? 'pending' : 'info'}>
            {t(`state_${booking.state}`)}
          </Pill>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <DetailField label={t('colMoveIn')} value={formatDate(booking.move_in)} />
          <DetailField label={t('colMoveOut')} value={formatDate(booking.move_out)} />
          <DetailField label={t('colMonthlyRent')} value={`€${booking.monthly_rent}/mo`} />
          <DetailField
            label={t('colDuration')}
            value={months != null ? t('durationMonths', { n: months }) : '—'}
          />
          <DetailField label={t('colRequested')} value={formatDate(booking.created_at)} />
          <DetailField label={t('totalStay')} value={`€${booking.total_stay_value}`} />
          {cost.due_at_move_in > 0 && (
            <DetailField
              label={t('dueAtMoveIn')}
              value={`€${cost.due_at_move_in}`}
            />
          )}
          <DetailField
            label={t('youReceive')}
            value={`€${receive.you_receive}`}
            info={
              <span className="block space-y-1">
                <span className="block">
                  {t('youReceiveBreakdown', {
                    deposit: receive.deposit,
                    commission: receive.commission_gross,
                    totalStay: receive.total_stay_value,
                    youReceive: receive.you_receive,
                  })}
                </span>
                <span className="block">{t('youReceivePayoutNote')}</span>
              </span>
            }
            infoAria={t('youReceiveInfoAria')}
          />
        </dl>

        {canRespond && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              variant="gold"
              disabled={acting}
              onClick={() => act('accept')}
            >
              {acting ? t('working') : t('accept')}
            </Button>
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => act('decline')}
            >
              {t('decline')}
            </Button>
          </div>
        )}

        {booking.state === 'confirmed' && (
          <div className="mt-8">
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => act('cancel')}
            >
              {t('cancel')}
            </Button>
          </div>
        )}
      </Card>

      <div className="mb-6">
        <GuestProfileCard student={student} />
      </div>

      <Card tone="parchment" className="p-6">
        <p className="label-caps text-night/60 mb-4">{t('timeline')}</p>
        <ul className="space-y-3">
          {timelineRows.map((row) => (
            <li
              key={row.key}
              className="flex items-start gap-3 text-sm text-night/80"
            >
              <Icon name="check" className="w-4 h-4 text-blue mt-0.5 shrink-0" />
              <span>
                <span className="font-medium text-night">{row.label}</span>
                <span className="text-night/50"> · {row.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </LandlordShell>
  );
}

function DetailField({ label, value, info, infoAria }) {
  return (
    <div>
      <dt className="label-caps text-night/50 flex items-center gap-1.5">
        <span>{label}</span>
        {info ? (
          <span className="relative group inline-flex">
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-night/25 text-[10px] font-sans font-bold text-night/50 hover:border-blue hover:text-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
              aria-label={infoAria || label}
            >
              i
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-sm border border-night/10 bg-night px-3 py-2 text-left text-xs font-sans font-normal normal-case tracking-normal text-stone opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {info}
            </span>
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 font-display text-xl text-night">{value}</dd>
    </div>
  );
}
