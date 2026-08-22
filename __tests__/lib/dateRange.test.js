import { describe, it, expect } from 'vitest';
import { parseISODate } from '@/lib/bookingDates';
import {
  FLEX_DAY_OPTIONS,
  GRID_CELLS,
  EMPTY_VALUE,
  addDays,
  addMonths,
  addMonthsToDate,
  applyFlexDays,
  buildMonthGrid,
  canPagePrev,
  clampDate,
  cursorShowingDate,
  dateFromKey,
  firstEnabledDate,
  initialCursor,
  isDisabledDate,
  isInRange,
  isSelectedRole,
  isValidDateString,
  mondayIndex,
  monthsFromCursor,
  normalizeValue,
  pageMonths,
  rangeRole,
  selectDate,
  todayYmd,
} from '@/lib/dateRange';

describe('isValidDateString', () => {
  it('accepts real YYYY-MM-DD calendar days and rejects rollovers', () => {
    expect(isValidDateString('2026-09-01')).toBe(true);
    expect(isValidDateString('2026-02-31')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString('09/01/2026')).toBe(false);
  });
});

describe('todayYmd', () => {
  it('uses the local calendar date, not UTC', () => {
    expect(todayYmd(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15');
    expect(todayYmd(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('addDays', () => {
  it('crosses months and years, and accepts negatives', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-09-15', -3)).toBe('2026-09-12');
    expect(addDays('not-a-date', 1)).toBe('');
  });
});

describe('buildMonthGrid', () => {
  it('pads to a Monday-first 6-week grid', () => {
    const cells = buildMonthGrid(2026, 8); // September 2026
    expect(cells).toHaveLength(GRID_CELLS);
    const first = cells.find(Boolean);
    expect(first).toEqual({ day: 1, date: '2026-09-01' });
    expect(cells.indexOf(first)).toBe(mondayIndex(parseISODate('2026-09-01')));
    expect(cells.filter(Boolean)).toHaveLength(30);
    expect(cells.filter((c) => c === null).length).toBe(GRID_CELLS - 30);
  });

  it('handles February in a common year and a leap year', () => {
    expect(buildMonthGrid(2026, 1).filter(Boolean)).toHaveLength(28);
    expect(buildMonthGrid(2028, 1).filter(Boolean).at(-1).date).toBe('2028-02-29');
  });
});

describe('isInRange', () => {
  it('is inclusive of both ends', () => {
    expect(isInRange('2026-09-15', '2026-09-15', '2027-06-30')).toBe(true);
    expect(isInRange('2027-06-30', '2026-09-15', '2027-06-30')).toBe(true);
    expect(isInRange('2026-12-01', '2026-09-15', '2027-06-30')).toBe(true);
  });

  it('rejects dates outside, incomplete, or inverted ranges', () => {
    expect(isInRange('2026-09-14', '2026-09-15', '2027-06-30')).toBe(false);
    expect(isInRange('2026-09-20', '2026-09-15', '')).toBe(false);
    expect(isInRange('2026-09-20', '2026-09-15', '2026-09-10')).toBe(false);
  });
});

describe('selectDate — restart-the-range rule', () => {
  const min = '2026-09-01';

  it('first click sets move-in', () => {
    expect(selectDate(EMPTY_VALUE, '2026-09-15', min)).toEqual({
      moveIn: '2026-09-15',
      moveOut: '',
      flexDays: 0,
    });
  });

  it('second click after move-in sets move-out', () => {
    expect(
      selectDate({ moveIn: '2026-09-15', moveOut: '', flexDays: 0 }, '2027-06-30', min),
    ).toEqual({
      moveIn: '2026-09-15',
      moveOut: '2027-06-30',
      flexDays: 0,
    });
  });

  it('a click on or before move-in restarts rather than inverting', () => {
    expect(
      selectDate({ moveIn: '2026-09-15', moveOut: '', flexDays: 7 }, '2026-09-10', min),
    ).toEqual({
      moveIn: '2026-09-10',
      moveOut: '',
      flexDays: 7,
    });
    expect(
      selectDate({ moveIn: '2026-09-15', moveOut: '', flexDays: 0 }, '2026-09-15', min),
    ).toEqual({
      moveIn: '2026-09-15',
      moveOut: '',
      flexDays: 0,
    });
  });

  it('any click once both ends are set starts a new range', () => {
    expect(
      selectDate(
        { moveIn: '2026-09-15', moveOut: '2027-06-30', flexDays: 3 },
        '2026-10-01',
        min,
      ),
    ).toEqual({
      moveIn: '2026-10-01',
      moveOut: '',
      flexDays: 3,
    });
  });

  it('ignores past (disabled) dates and preserves flexDays', () => {
    expect(
      selectDate({ moveIn: '2026-09-15', moveOut: '', flexDays: 1 }, '2026-08-31', min),
    ).toEqual({
      moveIn: '2026-09-15',
      moveOut: '',
      flexDays: 1,
    });
  });
});

describe('applyFlexDays — both ends, §15', () => {
  it('flexes move-in earlier and move-out later', () => {
    expect(
      applyFlexDays(
        { moveIn: '2026-09-15', moveOut: '2027-06-30', flexDays: 3 },
        '2026-01-01',
      ),
    ).toEqual({
      moveIn: '2026-09-12',
      moveOut: '2027-07-03',
      flexDays: 3,
    });
  });

  it('Exact dates (0) is a no-op on the clicked range', () => {
    expect(
      applyFlexDays(
        { moveIn: '2026-09-15', moveOut: '2027-06-30', flexDays: 0 },
        '2026-01-01',
      ),
    ).toEqual({
      moveIn: '2026-09-15',
      moveOut: '2027-06-30',
      flexDays: 0,
    });
  });

  it('clamps a flexed move-in up to minDate', () => {
    expect(
      applyFlexDays(
        { moveIn: '2026-09-02', moveOut: '2026-12-01', flexDays: 14 },
        '2026-09-01',
      ),
    ).toEqual({
      moveIn: '2026-09-01',
      moveOut: '2026-12-15',
      flexDays: 14,
    });
  });

  it('flexes whichever end is present when the range is incomplete', () => {
    expect(
      applyFlexDays({ moveIn: '2026-09-15', moveOut: '', flexDays: 2 }, '2026-09-01'),
    ).toEqual({
      moveIn: '2026-09-13',
      moveOut: '',
      flexDays: 2,
    });
  });

  it('covers every chip value on both ends', () => {
    expect(FLEX_DAY_OPTIONS).toEqual([0, 1, 2, 3, 7, 14]);
    for (const n of FLEX_DAY_OPTIONS) {
      const next = applyFlexDays(
        { moveIn: '2026-10-15', moveOut: '2027-06-15', flexDays: n },
        '2026-01-01',
      );
      expect(next.moveIn).toBe(addDays('2026-10-15', -n));
      expect(next.moveOut).toBe(addDays('2027-06-15', n));
    }
  });
});

describe('clampDate / isDisabledDate', () => {
  it('clamps dates before minDate and leaves later dates alone', () => {
    expect(clampDate('2026-08-31', '2026-09-01')).toBe('2026-09-01');
    expect(clampDate('2026-09-15', '2026-09-01')).toBe('2026-09-15');
    expect(clampDate('nope', '2026-09-01')).toBe('');
  });

  it('disables past dates against minDate', () => {
    expect(isDisabledDate('2026-08-31', '2026-09-01')).toBe(true);
    expect(isDisabledDate('2026-09-01', '2026-09-01')).toBe(false);
    expect(isDisabledDate('', '2026-09-01')).toBe(true);
  });
});

describe('paging', () => {
  it('does not page before the minDate month', () => {
    const cursor = { year: 2026, month: 8 };
    expect(canPagePrev(cursor, '2026-09-15')).toBe(false);
    expect(pageMonths(cursor, -2, '2026-09-15')).toEqual(cursor);
    expect(canPagePrev({ year: 2026, month: 9 }, '2026-09-15')).toBe(true);
    expect(pageMonths({ year: 2026, month: 10 }, -2, '2026-09-15')).toEqual({
      year: 2026,
      month: 8,
    });
  });

  it('pages the visible pair together', () => {
    expect(monthsFromCursor({ year: 2026, month: 8 }, 2)).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
    expect(pageMonths({ year: 2026, month: 8 }, 2, '2026-09-01')).toEqual({
      year: 2026,
      month: 10,
    });
  });
});

describe('keyboard dateFromKey', () => {
  const min = '2026-09-01';

  it('moves by day, week, and month', () => {
    expect(dateFromKey('2026-09-15', 'ArrowLeft', { minDate: min })).toBe('2026-09-14');
    expect(dateFromKey('2026-09-15', 'ArrowRight', { minDate: min })).toBe('2026-09-16');
    expect(dateFromKey('2026-09-15', 'ArrowUp', { minDate: min })).toBe('2026-09-08');
    expect(dateFromKey('2026-09-15', 'ArrowDown', { minDate: min })).toBe('2026-09-22');
    expect(dateFromKey('2026-09-15', 'PageDown', { minDate: min })).toBe('2026-10-15');
    expect(dateFromKey('2026-10-15', 'PageUp', { minDate: min })).toBe('2026-09-15');
  });

  it('clamps keyboard moves to minDate rather than landing on a disabled day', () => {
    expect(dateFromKey('2026-09-01', 'ArrowLeft', { minDate: min })).toBe(min);
    expect(dateFromKey('2026-09-03', 'ArrowUp', { minDate: min })).toBe(min);
    expect(dateFromKey('2026-09-15', 'PageUp', { minDate: min })).toBe(min);
    expect(dateFromKey('2026-09-15', 'Enter', { minDate: min })).toBeNull();
  });

  it('does not skip off the end of a short month', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(dateFromKey('2026-01-31', 'PageDown', { minDate: '2026-01-01' })).toBe(
      '2026-02-28',
    );
  });
});

describe('cursorShowingDate', () => {
  it('pages the leftmost month so the focused date stays in view', () => {
    const cursor = { year: 2026, month: 8 };
    expect(cursorShowingDate(cursor, 2, '2026-09-15')).toEqual(cursor);
    expect(cursorShowingDate(cursor, 2, '2026-11-01')).toEqual({
      year: 2026,
      month: 9,
    });
    expect(cursorShowingDate({ year: 2026, month: 10 }, 2, '2026-09-01')).toEqual({
      year: 2026,
      month: 8,
    });
  });
});

describe('rangeRole / aria-selected mapping', () => {
  it('marks committed endpoints and the interior, not a hover preview', () => {
    expect(rangeRole('2026-09-15', { moveIn: '2026-09-15', moveOut: '2026-09-20' })).toBe(
      'range-start',
    );
    expect(rangeRole('2026-09-20', { moveIn: '2026-09-15', moveOut: '2026-09-20' })).toBe(
      'end',
    );
    expect(rangeRole('2026-09-17', { moveIn: '2026-09-15', moveOut: '2026-09-20' })).toBe(
      'in-range',
    );
    expect(isSelectedRole('in-range')).toBe(true);
    expect(
      rangeRole('2026-09-18', {
        moveIn: '2026-09-15',
        moveOut: '',
        hoverDate: '2026-09-20',
      }),
    ).toBe('preview');
    expect(isSelectedRole('preview')).toBe(false);
  });

  it('treats an incomplete range as a single selected day', () => {
    expect(rangeRole('2026-09-15', { moveIn: '2026-09-15', moveOut: '' })).toBe('start');
    expect(rangeRole('2026-09-16', { moveIn: '2026-09-15', moveOut: '' })).toBeNull();
  });
});

describe('normalizeValue / initialCursor', () => {
  it('drops inverted or invalid dates and unknown flex values', () => {
    expect(
      normalizeValue({ moveIn: '2026-09-15', moveOut: '2026-09-01', flexDays: 99 }),
    ).toEqual({
      moveIn: '2026-09-15',
      moveOut: '',
      flexDays: 0,
    });
  });

  it('opens on the move-in month, clamped to minDate', () => {
    expect(
      initialCursor({ moveIn: '2026-11-01', moveOut: '', flexDays: 0 }, '2026-09-01'),
    ).toEqual({ year: 2026, month: 10 });
    expect(
      initialCursor({ moveIn: '2026-08-01', moveOut: '', flexDays: 0 }, '2026-09-15'),
    ).toEqual({ year: 2026, month: 8 });
  });

  it('finds the first enabled cell in a grid', () => {
    const cells = buildMonthGrid(2026, 8);
    expect(firstEnabledDate(cells, '2026-09-15')).toBe('2026-09-15');
  });
});
