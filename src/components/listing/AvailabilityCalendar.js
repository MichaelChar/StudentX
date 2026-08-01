'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';
import { datesOverlap } from '@/lib/bookingDates';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Monday-based weekday index 0..6 for a UTC date. */
function mondayIndex(date) {
  const dow = date.getUTCDay(); // 0 Sun .. 6 Sat
  return dow === 0 ? 6 : dow - 1;
}

/**
 * Month grid with three occupancy states from listing_availability_blocks:
 * Available (default) / Pending / Booked. Blackout counts as booked for display.
 */
export default function AvailabilityCalendar({ listingId }) {
  const t = useTranslations('propylaea.listing.calendar');
  const today = useMemo(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  }, []);

  const [cursor, setCursor] = useState(today);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();

  const rangeFrom = ymd(startOfMonth(year, month));
  const rangeTo = ymd(new Date(Date.UTC(year, month + 1, 0)));

  const fetchBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/listings/${listingId}/availability?from=${rangeFrom}&to=${rangeTo}`,
      );
      if (!res.ok) {
        setBlocks([]);
        return;
      }
      const data = await res.json();
      setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [listingId, rangeFrom, rangeTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-deps
    fetchBlocks();
  }, [fetchBlocks]);

  const cells = useMemo(() => {
    const dim = daysInMonth(year, month);
    const first = startOfMonth(year, month);
    const pad = mondayIndex(first);
    const out = [];
    for (let i = 0; i < pad; i += 1) out.push(null);
    for (let day = 1; day <= dim; day += 1) {
      const dateStr = ymd(new Date(Date.UTC(year, month, day)));
      out.push({ day, dateStr, state: dayState(dateStr, blocks) });
    }
    return out;
  }, [year, month, blocks]);

  const monthLabel = cursor.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function prevMonth() {
    setCursor(new Date(Date.UTC(year, month - 1, 1)));
  }
  function nextMonth() {
    setCursor(new Date(Date.UTC(year, month + 1, 1)));
  }

  return (
    <section className="mb-10">
      <p className="label-caps text-night/80 mb-4">{t('title')}</p>

      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 text-night/60 hover:text-blue rounded-sm"
          aria-label={t('prevMonth')}
        >
          <Icon name="chevronRight" className="w-4 h-4 rotate-180" />
        </button>
        <p className="font-display text-xl text-night">{monthLabel}</p>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 text-night/60 hover:text-blue rounded-sm"
          aria-label={t('nextMonth')}
        >
          <Icon name="chevronRight" className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {WEEKDAYS.map((d) => (
          <span key={d} className="label-caps text-night/40 py-1">
            {d}
          </span>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        aria-busy={loading}
        aria-label={t('gridLabel', { month: monthLabel })}
      >
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`e-${i}`} className="aspect-square" />;
          }
          const cls =
            cell.state === 'booked'
              ? 'bg-night text-stone'
              : cell.state === 'pending'
                ? 'bg-yellow/30 text-night'
                : 'bg-parchment text-night/80';
          return (
            <div
              key={cell.dateStr}
              className={`aspect-square rounded-sm flex items-center justify-center text-sm font-sans ${cls}`}
              title={t(`state_${cell.state}`)}
            >
              {cell.day}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-4 text-sm text-night/60">
        <Legend swatch="bg-parchment border border-night/10" label={t('state_available')} />
        <Legend swatch="bg-yellow/30" label={t('state_pending')} />
        <Legend swatch="bg-night" label={t('state_booked')} />
      </ul>
    </section>
  );
}

function Legend({ swatch, label }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded-sm ${swatch}`} aria-hidden="true" />
      {label}
    </li>
  );
}

function dayState(dateStr, blocks) {
  let pending = false;
  let booked = false;
  for (const b of blocks || []) {
    if (!datesOverlap(b.start_date, b.end_date, dateStr, dateStr)) continue;
    if (b.kind === 'booked' || b.kind === 'blackout') booked = true;
    if (b.kind === 'pending') pending = true;
  }
  if (booked) return 'booked';
  if (pending) return 'pending';
  return 'available';
}
