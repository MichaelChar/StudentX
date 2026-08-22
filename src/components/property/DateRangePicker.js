'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';

import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import Icon from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';
import { surfaceTransition } from '@/components/ui/overlay/motion';
import { stayDurationMonths } from '@/lib/bookingDates';
import {
  FLEX_DAY_OPTIONS,
  NAV_KEYS,
  buildMonthGrid,
  canPagePrev,
  cursorShowingDate,
  dateFromKey,
  initialCursor,
  initialFocusedDate,
  isDisabledDate,
  isSelectedRole,
  isValidDateString,
  monthsFromCursor,
  normalizeValue,
  pageMonths,
  rangeRole,
  selectDate,
  todayYmd,
} from '@/lib/dateRange';

/*
  DateRangePicker — two-month move-in / move-out panel (parity S4).

  Pure UI. Not mounted anywhere yet: the header search bar that owns
  the When segment is a parallel PR, and wiring this there would make
  both unreviewable. The parent is expected to drop this inside the
  F8 Popover (or a booking-card slot); this file is the panel, not the
  trigger. Popover already handles enter/exit, Escape and outside-click.

  Controlled. `value` / `onChange` fire on every day click and every
  flex-chip press so the header can live-update the When label. The
  panel does not read search params or fetch listings.

  Month-granularity, on purpose. Student lets run academic terms, not
  nights — backlog S4. There is no "2 nights" total. A complete range
  reads back as months via stayDurationMonths (the same helper bookings
  use), so a Sep–Jun pick says "9 months" rather than "287 nights".

  `± N days` flexes BOTH ends. Feature 1's inline note recommended
  move-in only; §15 (resolved 2026-08-08) superseded that. The chips
  write `flexDays` onto the value; they do not rewrite the clicked
  dates. `applyFlexDays` in dateRange.js is the search-window helper
  the parent will call when this is wired.

  Two months side by side from `md` (768px) up; one month below that.
  Shrinking two grids to fit a phone makes the days unreadable, which
  is the failure S4 called out. `months={1|2}` overrides the
  matchMedia resolution for tests and for a parent that already knows.

  Keyboard follows the grid pattern, not a mouse-only calendar:
  arrows move by day, PageUp/PageDown by month, Enter/Space select
  (native button activation). Past days are disabled and skipped by
  the roving tabindex.

  Motion: month paging fades/slides on opacity + transform only,
  250ms / ease-parity (large surface). Reduced motion drops the
  transform and the fade. Day hover is colour only.
*/

const WEEKDAY_KEYS = [
  'weekdayMon',
  'weekdayTue',
  'weekdayWed',
  'weekdayThu',
  'weekdayFri',
  'weekdaySat',
  'weekdaySun',
];

const MD_QUERY = '(min-width: 768px)';

const DAY_BASE =
  'relative z-10 flex w-full h-full items-center justify-center rounded-full ' +
  'font-sans text-sm select-none cursor-pointer ' +
  'transition-[background-color,color,opacity] motion-reduce:transition-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  'disabled:pointer-events-none';

function dayButtonClass(role, disabled, isToday) {
  if (disabled) {
    return `${DAY_BASE} text-night/30 cursor-not-allowed`;
  }
  if (role === 'start' || role === 'range-start' || role === 'end') {
    return `${DAY_BASE} bg-night text-stone hover:bg-night/90 active:bg-night/80`;
  }
  if (role === 'in-range' || role === 'preview' || role === 'preview-end') {
    return `${DAY_BASE} text-night hover:bg-night/10 active:bg-night/15`;
  }
  return (
    `${DAY_BASE} text-night hover:bg-parchment active:bg-parchment/70` +
    (isToday ? ' font-semibold' : '')
  );
}

function cellRangeClass(role) {
  if (role === 'in-range') return 'bg-parchment';
  if (role === 'preview') return 'bg-night/[0.04]';
  if (role === 'range-start') return 'bg-parchment rounded-l-full';
  if (role === 'end') return 'bg-parchment rounded-r-full';
  if (role === 'preview-end') return 'bg-night/[0.04] rounded-r-full';
  return '';
}

function chunkWeeks(cells) {
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dayAriaLabel(dateStr, role, formatDay, t) {
  const date = formatDay(dateStr);
  if (role === 'start' || role === 'range-start') return t('dayMoveIn', { date });
  if (role === 'end') return t('dayMoveOut', { date });
  return date;
}

function MonthGrid({
  year,
  month,
  label,
  weekdayLabels,
  minDate,
  today,
  moveIn,
  moveOut,
  hoverDate,
  focusedDate,
  onSelect,
  onHover,
  gridLabel,
  formatDay,
  t,
}) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const weeks = chunkWeeks(cells);
  const headingId = useId();

  return (
    <div className="min-w-0">
      <p
        id={headingId}
        className="font-display text-base text-night mb-3 px-1"
      >
        {label}
      </p>
      <div
        role="grid"
        aria-labelledby={headingId}
        aria-label={gridLabel}
        className="w-full"
      >
        <div role="row" className="grid grid-cols-7 mb-1">
          {weekdayLabels.map((name) => (
            <div
              key={name}
              role="columnheader"
              className="text-center label-caps text-night/40 py-1"
            >
              {name}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className="grid grid-cols-7">
            {week.map((cell, di) => {
              if (!cell) {
                return (
                  <div
                    key={`e-${wi}-${di}`}
                    role="gridcell"
                    className="aspect-square"
                  />
                );
              }
              const disabled = isDisabledDate(cell.date, minDate);
              const role = rangeRole(cell.date, {
                moveIn,
                moveOut,
                hoverDate,
              });
              const selected = isSelectedRole(role);
              const isToday = cell.date === today;
              const tabIndex =
                !disabled && cell.date === focusedDate ? 0 : -1;
              return (
                <div
                  key={cell.date}
                  role="gridcell"
                  aria-selected={selected || undefined}
                  className={`aspect-square p-[1px] ${cellRangeClass(role)}`}
                >
                  <button
                    type="button"
                    data-date={cell.date}
                    tabIndex={tabIndex}
                    disabled={disabled}
                    aria-label={dayAriaLabel(cell.date, role, formatDay, t)}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => onSelect(cell.date)}
                    onMouseEnter={() => {
                      if (!disabled) onHover(cell.date);
                    }}
                    onMouseLeave={() => onHover(null)}
                    className={dayButtonClass(role, disabled, isToday)}
                  >
                    {cell.day}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DateRangePicker({
  value,
  onChange,
  minDate: minDateProp,
  months,
  className = '',
}) {
  const t = useTranslations('propylaea.dateRange');
  const format = useFormatter();
  const reduced = useReducedMotion();
  const rootRef = useRef(null);
  const current = normalizeValue(value);
  const minDate = isValidDateString(minDateProp) ? minDateProp : todayYmd();
  const today = todayYmd();

  const [resolvedMonths, setResolvedMonths] = useState(
    months === 1 || months === 2 ? months : 2,
  );
  const [cursor, setCursor] = useState(() => initialCursor(current, minDate));
  const [focusedDate, setFocusedDate] = useState(() => minDate);
  const [hoverDate, setHoverDate] = useState(null);
  const [pageDir, setPageDir] = useState(1);
  const focusDayRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- matchMedia subscription */
  useEffect(() => {
    if (months === 1 || months === 2) {
      setResolvedMonths(months);
      return undefined;
    }
    const mq = window.matchMedia(MD_QUERY);
    const apply = () => setResolvedMonths(mq.matches ? 2 : 1);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [months]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const visibleMonths = useMemo(
    () => monthsFromCursor(cursor, resolvedMonths),
    [cursor, resolvedMonths],
  );
  const allCells = useMemo(
    () => visibleMonths.flatMap((m) => buildMonthGrid(m.year, m.month)),
    [visibleMonths],
  );

  const tabbableDate = useMemo(() => {
    if (focusedDate && !isDisabledDate(focusedDate, minDate)) {
      const visible = allCells.some((cell) => cell && cell.date === focusedDate);
      if (visible) return focusedDate;
    }
    return initialFocusedDate({
      value: { moveIn: current.moveIn, moveOut: '', flexDays: 0 },
      minDate,
      cells: allCells,
    });
  }, [focusedDate, allCells, minDate, current.moveIn]);

  useEffect(() => {
    if (!focusDayRef.current) return;
    focusDayRef.current = false;
    const el = rootRef.current?.querySelector(`[data-date="${tabbableDate}"]`);
    el?.focus();
  }, [tabbableDate, cursor]);

  const weekdayLabels = WEEKDAY_KEYS.map((key) => t(key));
  const canPrev = canPagePrev(cursor, minDate);
  const prevLabel = resolvedMonths === 1 ? t('prevMonth') : t('prevMonths');
  const nextLabel = resolvedMonths === 1 ? t('nextMonth') : t('nextMonths');

  function formatDay(dateStr) {
    const date = new Date(`${dateStr}T00:00:00Z`);
    return format.dateTime(date, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  function formatMonth(year, monthIndex) {
    const date = new Date(Date.UTC(year, monthIndex, 1));
    return format.dateTime(date, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  function emit(next) {
    onChange?.(normalizeValue(next));
  }

  function handleSelect(date) {
    const next = selectDate(current, date, minDate);
    emit(next);
    setFocusedDate(date);
  }

  function go(delta) {
    setPageDir(delta > 0 ? 1 : -1);
    setCursor((c) => pageMonths(c, delta, minDate));
  }

  function handleGridKeyDown(event) {
    if (!NAV_KEYS.has(event.key)) return;
    if (!event.target?.dataset?.date) return;
    event.preventDefault();
    const next = dateFromKey(tabbableDate, event.key, { minDate });
    if (!next) return;
    focusDayRef.current = true;
    setFocusedDate(next);
    setCursor((c) => cursorShowingDate(c, resolvedMonths, next));
  }

  function handleClear() {
    emit({ ...current, moveIn: '', moveOut: '' });
  }

  const monthsLabel = stayDurationMonths(current.moveIn, current.moveOut);
  const hasDates = Boolean(current.moveIn);
  let durationText = null;
  if (current.moveIn && current.moveOut) {
    durationText =
      monthsLabel && monthsLabel >= 1
        ? t('duration', { n: monthsLabel })
        : t('durationShort');
  }

  const liveText = current.moveIn
    ? current.moveOut
      ? t('selectionLive', {
          start: formatDay(current.moveIn),
          end: formatDay(current.moveOut),
        })
      : t('selectionStartOnly', { date: formatDay(current.moveIn) })
    : '';

  const labelledMonths = visibleMonths.map((m) => ({
    ...m,
    monthLabel: formatMonth(m.year, m.month),
  }));

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={t('panelLabel')}
      className={`w-full max-w-[44rem] p-4 bg-stone text-night ${className}`}
      onKeyDown={handleGridKeyDown}
    >
      <div className="flex items-center justify-between mb-2">
        <IconButton
          label={prevLabel}
          size="sm"
          variant="ghost"
          disabled={!canPrev}
          onClick={() => go(-resolvedMonths)}
        >
          <Icon name="chevronRight" className="w-4 h-4 rotate-180" />
        </IconButton>
        <IconButton
          label={nextLabel}
          size="sm"
          variant="ghost"
          onClick={() => go(resolvedMonths)}
        >
          <Icon name="chevronRight" className="w-4 h-4" />
        </IconButton>
      </div>

      <motion.div
        key={`${cursor.year}-${cursor.month}-${resolvedMonths}`}
        initial={reduced ? false : { opacity: 0, x: pageDir * 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduced ? { duration: 0 } : surfaceTransition}
        className={
          resolvedMonths > 1
            ? 'grid grid-cols-1 md:grid-cols-2 gap-8'
            : 'grid grid-cols-1 gap-8'
        }
      >
        {labelledMonths.map((m, i) => (
          <div
            key={`${m.year}-${m.month}`}
            className={i > 0 && months == null ? 'hidden md:block' : undefined}
          >
            <MonthGrid
              year={m.year}
              month={m.month}
              label={m.monthLabel}
              weekdayLabels={weekdayLabels}
              minDate={minDate}
              today={today}
              moveIn={current.moveIn}
              moveOut={current.moveOut}
              hoverDate={hoverDate}
              focusedDate={tabbableDate}
              onSelect={handleSelect}
              onHover={setHoverDate}
              gridLabel={t('gridLabel', { month: m.monthLabel })}
              formatDay={formatDay}
              t={t}
            />
          </div>
        ))}
      </motion.div>

      <div
        role="group"
        aria-label={t('flexLabel')}
        className="mt-5 flex flex-wrap gap-2"
      >
        {FLEX_DAY_OPTIONS.map((n) => (
          <Chip
            key={n}
            selected={current.flexDays === n}
            onClick={() => emit({ ...current, flexDays: n })}
          >
            {n === 0 ? t('flexExact') : t('flexDays', { n })}
          </Chip>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 min-h-8">
        <p className="text-sm font-sans text-night/60">
          {durationText}
        </p>
        {hasDates ? (
          <Button variant="tertiary" size="sm" onClick={handleClear}>
            {t('clear')}
          </Button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
    </div>
  );
}
