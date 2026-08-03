'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { Link } from '@/i18n/navigation';

import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  stayDurationMonths,
  stayDurationMonthsExact,
  costSummary,
} from '@/lib/bookingDates';
import { CANCELLATION_TIERS } from '@/lib/cancellationPolicy';

const CANCELLATION_COPY_KEY = {
  free: 'cancellationFree',
  half: 'cancellationHalf',
};

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
  if (state === 'accepted' || state === 'confirmed' || state === 'moved_in') {
    return 'info';
  }
  if (state === 'disputed') return 'pending';
  return 'amenity';
}

/**
 * Student-facing booking detail — mirrors landlord reservation detail.
 */
export default function StudentBookingDetail({ bookingId }) {
  const t = useTranslations('student.bookings');
  const [booking, setBooking] = useState(null);
  const [events, setEvents] = useState([]);
  const [inquiryId, setInquiryId] = useState(null);
  const [moveInMeta, setMoveInMeta] = useState({ can_respond: false, answered: false });
  const [canCancel, setCanCancel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [problemText, setProblemText] = useState('');

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
      setEvents(data.events || []);
      setInquiryId(data.inquiry_id || null);
      setMoveInMeta(data.move_in || { can_respond: false, answered: false });
      setCanCancel(Boolean(data.can_cancel));
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

  async function act(action, extra = {}) {
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
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('actionError'));
        return false;
      }
      setBooking(data.booking);
      await load();
      return true;
    } catch {
      setError(t('actionError'));
      return false;
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return <div className="h-40 bg-parchment rounded-sm animate-pulse" />;
  }

  if (!booking) {
    return (
      <Card tone="parchment" className="p-12 text-center">
        <p className="font-display text-xl text-night/60">{t('notFound')}</p>
        <Link
          href="/student/account/bookings"
          className="label-caps text-blue mt-4 inline-block"
        >
          ← {t('back')}
        </Link>
      </Card>
    );
  }

  const listing = Array.isArray(booking.listings)
    ? booking.listings[0]
    : booking.listings;
  const loc = Array.isArray(listing?.location)
    ? listing.location[0]
    : listing?.location;
  const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;
  const label = listing?.title || loc?.address || booking.listing_id;
  const months = stayDurationMonths(booking.move_in, booking.move_out);
  const cost = costSummary({
    monthlyRent: booking.monthly_rent,
    months: months || 0,
    monthsExact: stayDurationMonthsExact(booking.move_in, booking.move_out),
    deposit: rent?.deposit,
    agencyFee: listing?.agency_fee,
  });
  const listingHref = listing?.listing_id
    ? `/property/thessaloniki/listing/${listing.listing_id}`
    : null;

  return (
    <>
      {error && (
        <p className="text-sm text-magenta bg-parchment border border-night/10 rounded-sm px-4 py-3 mb-6">
          {error}
        </p>
      )}

      <Card tone="white" className="p-6 md:p-8 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="label-caps text-night/50">{t('detailEyebrow')}</p>
            {listingHref ? (
              <Link
                href={listingHref}
                className="font-display text-2xl md:text-3xl text-night mt-1 hover:text-blue transition-colors inline-block"
              >
                {label}
              </Link>
            ) : (
              <h2 className="font-display text-2xl md:text-3xl text-night mt-1">
                {label}
              </h2>
            )}
            {loc?.neighborhood && (
              <p className="text-sm text-night/60 mt-1">{loc.neighborhood}</p>
            )}
          </div>
          <Pill variant={statusVariant(booking.state)}>
            {t(`state_${booking.state}`)}
          </Pill>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <DetailField label={t('colMoveIn')} value={formatDate(booking.move_in)} />
          <DetailField label={t('colMoveOut')} value={formatDate(booking.move_out)} />
          <DetailField label={t('colRent')} value={`€${booking.monthly_rent}/mo`} />
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
        </dl>

        {(cost.deposit > 0 || cost.agency_fee > 0) && (
          <div className="mt-6 rounded-sm border border-night/10 bg-parchment px-5 py-4">
            <p className="label-caps text-night/50 mb-2">{t('costSummary')}</p>
            <ul className="space-y-1 text-sm text-night/80 font-sans">
              <li>
                {t('totalRent')}: €{cost.total_rent}
              </li>
              {cost.deposit > 0 && (
                <li>
                  {t('depositDueMoveIn')}: €{cost.deposit}
                </li>
              )}
              {cost.agency_fee > 0 && (
                <li>
                  {t('agencyFeeDueMoveIn')}: €{cost.agency_fee}
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="mt-6">
          <p className="label-caps text-night/50 mb-2">{t('cancellationPolicy')}</p>
          <ul className="space-y-1 text-sm text-night/70 font-sans list-disc pl-5">
            {CANCELLATION_TIERS.map((tier) => (
              <li key={tier.id}>{t(CANCELLATION_COPY_KEY[tier.id])}</li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-sm text-night/50">{t('offlineNote')}</p>

        {moveInMeta.can_respond && (
          <div className="mt-8 rounded-sm border border-night/10 bg-parchment p-5 md:p-6">
            <p className="label-caps text-yellow mb-2">{t('moveInPromptEyebrow')}</p>
            <h3 className="font-display text-2xl text-night mb-2">
              {t('moveInPromptTitle')}
            </h3>
            <p className="text-sm text-night/70 mb-5">{t('moveInPromptBody')}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="gold"
                disabled={acting}
                onClick={() => act('confirm-move-in')}
              >
                {acting ? t('working') : t('confirmMoveIn')}
              </Button>
              <Button
                variant="outline"
                disabled={acting}
                onClick={() => setReportOpen(true)}
              >
                {t('reportProblem')}
              </Button>
            </div>
          </div>
        )}

        {booking.state === 'moved_in' && (
          <p className="mt-6 text-sm text-night/60 font-sans">{t('moveInConfirmedNote')}</p>
        )}

        {booking.state === 'disputed' && (
          <p className="mt-6 text-sm text-night/60 font-sans">{t('moveInDisputedNote')}</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {inquiryId && (
            <Button
              href={`/student/inquiries/${inquiryId}`}
              variant="primary"
              size="sm"
            >
              <Icon name="message" className="w-3.5 h-3.5" />
              {t('openThread')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => setConfirmCancelOpen(true)}
            >
              {t('cancel')}
            </Button>
          )}
        </div>
      </Card>

      {events.length > 0 && (
        <Card tone="parchment" className="p-6">
          <p className="label-caps text-night/60 mb-4">{t('timeline')}</p>
          <ul className="space-y-3">
            {events.map((ev) => (
              <li
                key={ev.event_id}
                className="flex items-start gap-3 text-sm text-night/80"
              >
                <Icon name="check" className="w-4 h-4 text-blue mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium text-night">
                    {ev.from_state
                      ? `${ev.from_state} → ${ev.to_state}`
                      : ev.to_state}
                    {ev.metadata?.kind ? ` (${ev.metadata.kind})` : ''}
                  </span>
                  <span className="text-night/50">
                    {' '}
                    · {ev.actor} · {formatDate(ev.created_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={confirmCancelOpen}
        title={t('cancelConfirmTitle')}
        body={t('cancelConfirmBody')}
        confirmLabel={acting ? t('working') : t('cancelConfirmCta')}
        cancelLabel={t('cancelConfirmDismiss')}
        destructive
        busy={acting}
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={async () => {
          const ok = await act('cancel');
          if (ok) setConfirmCancelOpen(false);
        }}
      />

      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-night/60"
            onClick={() => (acting ? null : setReportOpen(false))}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-problem-title"
            className="relative z-10 w-full max-w-md rounded-sm border border-night/10 bg-parchment text-night p-6 md:p-7"
          >
            <h2
              id="report-problem-title"
              className="font-display text-2xl text-night leading-tight"
            >
              {t('reportProblemTitle')}
            </h2>
            <p className="mt-3 text-sm text-night/70 leading-relaxed">
              {t('reportProblemBody')}
            </p>
            <label className="block mt-4">
              <span className="label-caps text-night/50">{t('reportProblemLabel')}</span>
              <textarea
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
                rows={4}
                disabled={acting}
                className="mt-2 w-full rounded-sm border border-night/10 bg-white px-3 py-2 text-sm text-night font-sans focus:outline-none focus:border-blue"
              />
            </label>
            <div className="mt-7 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                disabled={acting}
                className="label-caps px-4 py-2.5 rounded-sm border border-night/20 text-night/70 hover:border-night hover:text-night transition-colors disabled:opacity-50"
              >
                {t('cancelConfirmDismiss')}
              </button>
              <button
                type="button"
                disabled={acting || problemText.trim().length < 10}
                onClick={async () => {
                  const ok = await act('report-problem', {
                    description: problemText,
                  });
                  if (ok) {
                    setReportOpen(false);
                    setProblemText('');
                  }
                }}
                className="label-caps px-4 py-2.5 rounded-sm text-white bg-blue hover:bg-night transition-colors disabled:opacity-50"
              >
                {acting ? t('working') : t('reportProblemSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <dt className="label-caps text-night/50">{label}</dt>
      <dd className="mt-1 font-display text-xl text-night">{value}</dd>
    </div>
  );
}
