'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import Icon from '@/components/ui/Icon';
import {
  addDays,
  monthCells,
  parseISODate,
  startOfMonth,
  ymd,
} from '@/lib/bookingDates';

/*
  DateRangePanel — the `When` segment's dropdown (parity Feature 1).

  Two-month grid, range selection, `‹ ›` month paging, flexibility chips.
  Airbnb's `Dates | Flexible` segmented control is dropped per Feature 1;
  only the exact-date panel ships, with flex expressed as chips beneath it.

  RANGE SEMANTICS. A range is move-in → move-out, which yields duration
  implicitly (Feature 1 supersedes §5.1's "move-in month + duration"). First
  click sets move-in and clears move-out; the second sets move-out. Clicking
  a date at or before the current move-in restarts the range rather than
  producing an inverted one — the alternative is a panel that can emit
  move_out < move_in, which every downstream consumer would have to defend
  against.

  FLEX APPLIES TO BOTH ENDS (§15, 2026-08-08). This supersedes the Feature 1
  note recommending move-in only. `flexDays` is carried as state, NOT baked
  into the emitted dates: the exact range stays exact, and the caller sends
  the flex window as its own param. Widening the dates here would make the
  chip irreversible — going ± 7 then back to Exact could not recover the
  student's original pick.

  This component owns no dates. `value` / `onChange` come from the caller so
  HeaderSearch stays free of date maths, matching its `renderDatePanel` prop.
*/

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Airbnb's ladder. `0` renders as `Exact dates`.
export const FLEX_OPTIONS = [0, 1, 2, 3, 7, 14];

function monthLabel(year, monthIndex) {
  return startOfMonth(year, monthIndex).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function MonthGrid({ year, monthIndex, moveIn, moveOut, minDate, onPick }) {
  const cells = useMemo(() => monthCells(year, monthIndex), [year, monthIndex]);

  return (
    <div className="w-64">
      <p className="mb-3 text-center font-display text-base text-night">
        {monthLabel(year, monthIndex)}
      </p>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="label-caps py-1 text-night/40">
            {d.charAt(0)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`pad-${i}`} aria-hidden="true" />;

          const { day, dateStr } = cell;
          const isPast = dateStr < minDate;
          const isStart = dateStr === moveIn;
          const isEnd = dateStr === moveOut;
          const inRange = moveIn && moveOut && dateStr > moveIn && dateStr < moveOut;

          // Endpoints read as solid; the span between them is a tint. Past
          // days stay visible but inert — hiding them makes the grid jump.
          let tone = 'text-night hover:bg-parchment active:bg-parchment/70';
          if (isPast) tone = 'text-night/25 cursor-not-allowed';
          else if (isStart || isEnd) tone = 'bg-blue text-white';
          else if (inRange) tone = 'bg-blue/10 text-night';

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isPast}
              onClick={() => onPick(dateStr)}
              aria-label={dateStr}
              aria-pressed={isStart || isEnd}
              className={`h-9 rounded-control text-sm transition-colors ${tone}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePanel({ value, onChange }) {
  const t = useTranslations('propylaea.search');

  const moveIn = value?.moveIn || '';
  const moveOut = value?.moveOut || '';
  const flexDays = value?.flexDays ?? 0;

  // Today, as a UTC calendar date. Everything before it is unselectable.
  const minDate = useMemo(() => ymd(new Date()), []);

  // The left-hand month. Opens on the current move-in so reopening the panel
  // returns the student to their own dates, not to today.
  const [cursor, setCursor] = useState(() => {
    const anchor = parseISODate(moveIn) || new Date();
    return { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() };
  });

  const rightMonth = startOfMonth(cursor.year, cursor.month + 1);

  function pick(dateStr) {
    // No move-in yet, or a completed range, or a click at/before the current
    // move-in → start over from this date.
    if (!moveIn || moveOut || dateStr <= moveIn) {
      onChange?.({ moveIn: dateStr, moveOut: '', flexDays });
      return;
    }
    onChange?.({ moveIn, moveOut: dateStr, flexDays });
  }

  function setFlex(days) {
    onChange?.({ moveIn, moveOut, flexDays: days });
  }

  function clear() {
    onChange?.({ moveIn: '', moveOut: '', flexDays: 0 });
  }

  function shiftMonths(delta) {
    const next = startOfMonth(cursor.year, cursor.month + delta);
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  }

  // Paging back past the current month would only offer unselectable days.
  const atFloor =
    startOfMonth(cursor.year, cursor.month) <= startOfMonth(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonths(-1)}
          disabled={atFloor}
          aria-label={t('prevMonth')}
          className="rounded-control p-2 text-night/60 transition-colors hover:text-blue
                     active:text-blue/80 disabled:pointer-events-none disabled:text-night/20"
        >
          <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => shiftMonths(1)}
          aria-label={t('nextMonth')}
          className="rounded-control p-2 text-night/60 transition-colors hover:text-blue active:text-blue/80"
        >
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-6">
        <MonthGrid
          year={cursor.year}
          monthIndex={cursor.month}
          moveIn={moveIn}
          moveOut={moveOut}
          minDate={minDate}
          onPick={pick}
        />
        <MonthGrid
          year={rightMonth.getUTCFullYear()}
          monthIndex={rightMonth.getUTCMonth()}
          moveIn={moveIn}
          moveOut={moveOut}
          minDate={minDate}
          onPick={pick}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-night/10 pt-4">
        {FLEX_OPTIONS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => setFlex(days)}
            aria-pressed={flexDays === days}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              flexDays === days
                ? 'border-blue bg-blue text-white'
                : 'border-night/15 text-night hover:border-night/30 active:bg-parchment'
            }`}
          >
            {days === 0 ? t('exactDates') : t('flexDays', { days })}
          </button>
        ))}
        {(moveIn || moveOut) && (
          <button
            type="button"
            onClick={clear}
            className="ml-auto text-sm text-night/60 underline underline-offset-4
                       transition-colors hover:text-night"
          >
            {t('clearDates')}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The flex window a range implies, as YYYY-MM-DD bounds.
 *
 * Flex widens BOTH ends (§15). Kept next to the panel and exported so the
 * caller that turns a selection into query params does not re-derive it.
 */
export function flexWindow({ moveIn, moveOut, flexDays = 0 }) {
  if (!moveIn) return { from: '', to: '' };
  const end = moveOut || moveIn;
  return {
    from: flexDays ? addDays(moveIn, -flexDays) || moveIn : moveIn,
    to: flexDays ? addDays(end, flexDays) || end : end,
  };
}
