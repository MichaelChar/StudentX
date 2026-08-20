'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { Link } from '@/i18n/navigation';

import LandlordShell from '@/components/landlord/LandlordShell';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import { stayDurationMonths } from '@/lib/bookingDates';
import { formatMoney } from '@/lib/formatMoney';
import { bookingStateVariant } from '@/lib/statusVariant';

const TABS = ['requested', 'accepted', 'confirmed', 'declined', 'cancelled'];

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

export default function LandlordReservationsPage() {
  const t = useTranslations('propylaea.landlord.reservations');
  const [bookings, setBookings] = useState([]);
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState('requested');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBookings = useCallback(async (accessToken) => {
    try {
      const res = await fetch('/api/bookings', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t('loadError'));
        return;
      }
      const data = await res.json();
      setBookings(data.bookings || []);
      setCounts(data.counts || {});
    } catch {
      setError(t('loadError'));
    }
  }, [t]);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      await fetchBookings(session.access_token);
      setLoading(false);
    })();
  }, [fetchBookings]);

  const filtered = useMemo(() => {
    // Offline accept lands on confirmed; "accepted" tab still shows accepted rows.
    // Confirmed tab includes moved_in (student confirmed stay).
    // For cancelled tab include expired as well (terminal failures).
    if (tab === 'cancelled') {
      return bookings.filter((b) => b.state === 'cancelled' || b.state === 'expired');
    }
    if (tab === 'confirmed') {
      return bookings.filter((b) => b.state === 'confirmed' || b.state === 'moved_in');
    }
    return bookings.filter((b) => b.state === tab);
  }, [bookings, tab]);

  return (
    <LandlordShell eyebrow={t('eyebrow')} title={t('title')}>
      {error && (
        <p className="text-sm text-magenta bg-parchment border border-night/10 rounded-control px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {/* Filter tabs with live counts */}
      <div className="flex flex-wrap gap-2 mb-8">
        {TABS.map((key) => {
          const count =
            key === 'cancelled'
              ? (counts.cancelled || 0) + (counts.expired || 0)
              : key === 'confirmed'
                ? (counts.confirmed || 0) + (counts.moved_in || 0)
                : counts[key] || 0;
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={active}
              className={`label-caps px-3 py-2 rounded-control border transition-colors ${
                active
                  ? 'bg-night text-stone border-night'
                  : 'bg-white text-night/70 border-night/10 hover:border-night/30 active:bg-night/5'
              }`}
            >
              {t(`tab_${key}`)}
              <span className={`ml-2 ${active ? 'text-yellow' : 'text-night/40'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-parchment rounded-control animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card tone="parchment" className="p-12 text-center">
          <Icon name="calendar" className="w-12 h-12 mx-auto text-night/30 mb-3" />
          <p className="font-display text-xl text-night/60">{t('empty')}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-card border border-night/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-night/10 bg-parchment">
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colStatus')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colStudent')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colRequested')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colListing')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colMoveIn')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colMoveOut')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colRent')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colDuration')}</th>
                <th className="label-caps text-night/60 px-4 py-3 font-normal">{t('colDetails')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const student = Array.isArray(b.students) ? b.students[0] : b.students;
                const listing = Array.isArray(b.listings) ? b.listings[0] : b.listings;
                const loc = Array.isArray(listing?.location)
                  ? listing.location[0]
                  : listing?.location;
                const label =
                  listing?.title ||
                  loc?.address ||
                  b.listing_id;
                const months = stayDurationMonths(b.move_in, b.move_out);
                return (
                  <tr
                    key={b.booking_id}
                    className="border-b border-night/10 last:border-0 hover:bg-parchment/60"
                  >
                    <td className="px-4 py-3">
                      <Pill variant={bookingStateVariant(b.state)}>
                        {t(`state_${b.state}`)}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-night font-medium">
                      {student?.display_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-night/70">{formatDate(b.created_at)}</td>
                    <td className="px-4 py-3 text-night max-w-[12rem] truncate">{label}</td>
                    <td className="px-4 py-3 text-night/70">{formatDate(b.move_in)}</td>
                    <td className="px-4 py-3 text-night/70">{formatDate(b.move_out)}</td>
                    <td className="px-4 py-3 text-night">
                      {formatMoney(b.total_stay_value ?? b.monthly_rent)}
                    </td>
                    <td className="px-4 py-3 text-night/70">
                      {months != null ? t('durationMonths', { n: months }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/property/thessaloniki/landlord/reservations/${b.booking_id}`}
                        className="label-caps text-blue hover:text-night"
                      >
                        {t('viewDetails')} →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </LandlordShell>
  );
}
