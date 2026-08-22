import { parseISODate } from '@/lib/bookingDates';

/*
  Date maths for the property DateRangePicker (parity S4 / Feature 1).

  Dates in this codebase are calendar days as YYYY-MM-DD strings, not
  Date objects and not instants. Storage, filters and bookings already
  round-trip through `parseISODate` (UTC midnight); this module uses
  the same parser so a picker date is the same string the listings
  query will see.

  Two things this file is careful about:

  1. `todayYmd` is LOCAL, not UTC. "Past dates disabled" is a UX rule
     about the student's calendar day. UTC midnight would disable
     "today" in Greece after 02:00/03:00 in summer, or keep yesterday
     clickable in the US evening. minDate still accepts an explicit
     YYYY-MM-DD override (tests, or a parent that has its own today).

  2. `± N days` flexes BOTH ends. Feature 1's inline note recommended
     move-in only; §15 (resolved 2026-08-08) superseded that. applyFlexDays
     subtracts N from move-in and adds N to move-out, then clamps
     move-in up to minDate so a ±14 next to today cannot walk into
     the past.
*/

export const FLEX_DAY_OPTIONS = [0, 1, 2, 3, 7, 14];
export const EMPTY_VALUE = Object.freeze({
  moveIn: '',
  moveOut: '',
  flexDays: 0,
});
export const GRID_CELLS = 42;
export const NAV_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
]);

export function isValidDateString(value) {
  return parseISODate(value) != null;
}

export function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

/** Local calendar day of `now` as YYYY-MM-DD. */
export function todayYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(ymd, n) {
  const date = parseISODate(ymd);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + Number(n));
  return formatYmd(date);
}

export function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Monday-based weekday index 0..6 for a UTC date. Matches AvailabilityCalendar. */
export function mondayIndex(date) {
  const dow = date.getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

export function addMonths(year, monthIndex, delta) {
  const date = new Date(Date.UTC(year, monthIndex + Number(delta), 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function yearMonthFromYmd(ymd) {
  const date = parseISODate(ymd);
  if (!date) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function compareYearMonth(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

export function monthsFromCursor(cursor, count) {
  const n = Math.max(1, Number(count) || 1);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(addMonths(cursor.year, cursor.month, i));
  }
  return out;
}

/**
 * Six-week Monday-first grid. Always 42 cells so paging between a
 * 5-row month and a 6-row month does not resize the panel.
 */
export function buildMonthGrid(year, monthIndex) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const dim = daysInMonth(year, monthIndex);
  const pad = mondayIndex(first);
  const cells = [];
  for (let i = 0; i < pad; i += 1) cells.push(null);
  for (let day = 1; day <= dim; day += 1) {
    cells.push({
      day,
      date: formatYmd(new Date(Date.UTC(year, monthIndex, day))),
    });
  }
  while (cells.length < GRID_CELLS) cells.push(null);
  return cells;
}

export function isDisabledDate(date, minDate) {
  if (!isValidDateString(date)) return true;
  if (minDate && isValidDateString(minDate) && date < minDate) return true;
  return false;
}

export function clampDate(ymd, minDate) {
  if (!isValidDateString(ymd)) return '';
  if (minDate && isValidDateString(minDate) && ymd < minDate) return minDate;
  return ymd;
}

/** Inclusive of both ends. Incomplete or inverted ranges contain nothing. */
export function isInRange(date, start, end) {
  if (!date || !start || !end) return false;
  if (end < start) return false;
  return date >= start && date <= end;
}

export function normalizeValue(value) {
  const src = value && typeof value === 'object' ? value : {};
  const moveIn = isValidDateString(src.moveIn) ? src.moveIn : '';
  let moveOut = isValidDateString(src.moveOut) ? src.moveOut : '';
  if (moveOut && (!moveIn || moveOut <= moveIn)) moveOut = '';
  const flexDays = FLEX_DAY_OPTIONS.includes(src.flexDays) ? src.flexDays : 0;
  return { moveIn, moveOut, flexDays };
}

/**
 * Range-selection state machine.
 *
 * First click sets move-in. Second click (after move-in) sets move-out.
 * A click on or before the current move-in, or any click once both
 * ends are set, restarts rather than producing an inverted range.
 * flexDays is preserved across restarts — it is a search modifier,
 * not part of the clicked range.
 */
export function selectDate(value, clicked, minDate) {
  const current = normalizeValue(value);
  if (isDisabledDate(clicked, minDate)) return current;

  const { moveIn, moveOut, flexDays } = current;
  if (!moveIn || moveOut || clicked <= moveIn) {
    return { moveIn: clicked, moveOut: '', flexDays };
  }
  return { moveIn, moveOut: clicked, flexDays };
}

/**
 * Expand a selected range by ±flexDays on BOTH ends.
 *
 * Returns the search window, not a new selection: the picker keeps
 * showing the dates the student clicked. Move-in shifts earlier,
 * move-out later; move-in is clamped to minDate.
 */
export function applyFlexDays(value, minDate) {
  const current = normalizeValue(value);
  const min = isValidDateString(minDate) ? minDate : '';
  const n = current.flexDays;
  let { moveIn, moveOut } = current;

  if (moveIn) {
    const flexed = n ? addDays(moveIn, -n) : moveIn;
    moveIn = min ? clampDate(flexed, min) : flexed;
  }
  if (moveOut && n) {
    moveOut = addDays(moveOut, n);
  }
  if (moveIn && moveOut && moveOut <= moveIn) {
    moveOut = addDays(moveIn, 1);
  }

  return { moveIn, moveOut, flexDays: n };
}

export function canPagePrev(cursor, minDate) {
  const minYm = yearMonthFromYmd(minDate);
  if (!minYm || !cursor) return true;
  return compareYearMonth(cursor, minYm) > 0;
}

export function pageMonths(cursor, delta, minDate) {
  const next = addMonths(cursor.year, cursor.month, delta);
  const minYm = yearMonthFromYmd(minDate);
  if (minYm && compareYearMonth(next, minYm) < 0) return minYm;
  return next;
}

export function addMonthsToDate(ymd, delta) {
  const date = parseISODate(ymd);
  if (!date) return '';
  const day = date.getUTCDate();
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(delta), 1),
  );
  const dim = daysInMonth(next.getUTCFullYear(), next.getUTCMonth());
  next.setUTCDate(Math.min(day, dim));
  return formatYmd(next);
}

export function dateFromKey(current, key, { minDate } = {}) {
  if (!NAV_KEYS.has(key)) return null;
  let next = current;
  if (key === 'ArrowLeft') next = addDays(current, -1);
  else if (key === 'ArrowRight') next = addDays(current, 1);
  else if (key === 'ArrowUp') next = addDays(current, -7);
  else if (key === 'ArrowDown') next = addDays(current, 7);
  else if (key === 'PageUp') next = addMonthsToDate(current, -1);
  else if (key === 'PageDown') next = addMonthsToDate(current, 1);
  if (!next) return current;
  if (minDate && isValidDateString(minDate) && next < minDate) return minDate;
  return next;
}

/** Shift the leftmost month so `date` falls inside the visible pair (or single). */
export function cursorShowingDate(cursor, visibleMonths, date) {
  const ym = yearMonthFromYmd(date);
  if (!ym || !cursor) return cursor;
  const last = addMonths(cursor.year, cursor.month, visibleMonths - 1);
  if (compareYearMonth(ym, cursor) < 0) return ym;
  if (compareYearMonth(ym, last) > 0) {
    return addMonths(ym.year, ym.month, -(visibleMonths - 1));
  }
  return cursor;
}

/**
 * Visual role of a day inside the selected (or hover-previewed) range.
 * Preview roles are hover-only and must not set aria-selected.
 */
export function rangeRole(date, { moveIn, moveOut, hoverDate } = {}) {
  if (!date || !moveIn) return null;
  const previewing =
    !moveOut && hoverDate && hoverDate > moveIn ? hoverDate : '';
  const end = moveOut || previewing;
  if (!end) return date === moveIn ? 'start' : null;
  if (date === moveIn) return 'range-start';
  if (date === end) return previewing ? 'preview-end' : 'end';
  if (date > moveIn && date < end) return previewing ? 'preview' : 'in-range';
  return null;
}

export function isSelectedRole(role) {
  return role === 'start' || role === 'range-start' || role === 'end' || role === 'in-range';
}

export function firstEnabledDate(cells, minDate) {
  for (const cell of cells) {
    if (cell && !isDisabledDate(cell.date, minDate)) return cell.date;
  }
  return '';
}

export function initialCursor(value, minDate) {
  const { moveIn } = normalizeValue(value);
  const from =
    yearMonthFromYmd(moveIn) ||
    yearMonthFromYmd(minDate) ||
    yearMonthFromYmd(todayYmd());
  const minYm = yearMonthFromYmd(minDate);
  if (minYm && compareYearMonth(from, minYm) < 0) return minYm;
  return from;
}

export function initialFocusedDate({ value, minDate, cells }) {
  const { moveIn } = normalizeValue(value);
  if (
    moveIn &&
    !isDisabledDate(moveIn, minDate) &&
    (!cells || cells.some((cell) => cell && cell.date === moveIn))
  ) {
    return moveIn;
  }
  if (minDate && cells?.some((cell) => cell && cell.date === minDate)) {
    return minDate;
  }
  return firstEnabledDate(cells || [], minDate);
}
