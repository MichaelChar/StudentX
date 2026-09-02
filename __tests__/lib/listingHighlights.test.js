import { describe, it, expect } from 'vitest';
import { deriveListingHighlights } from '@/lib/listingHighlights';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-08-27T12:00:00Z').getTime();
const FRESH = new Date('2026-08-26T12:00:00Z').toISOString();

const fd = (faculty_id, walk_minutes, faculty_name = faculty_id) => ({
  faculty_id,
  faculty_name,
  walk_minutes,
});

const listing = (over = {}) => ({
  faculty_distances: [
    fd('auth-agriculture', 17, 'Faculty of Agriculture'),
    fd('auth-library', 20, 'AUTH Central Library'),
    fd('auth-medical', 35, 'Faculty of Health Sciences'),
  ],
  bills_included: false,
  avg_response_ms: null,
  response_stats_at: null,
  ...over,
});

const keys = (rows) => rows.map((r) => r.title.key);

describe('deriveListingHighlights — order and gating', () => {
  /*
    The spec is emphatic: fixed order, no conditional ranking, no substitution.
    Rows 2 and 3 vanish when false; nothing is promoted to fill the gap.
  */
  it('keeps the fixed order when all three qualify', () => {
    const rows = deriveListingHighlights(
      listing({ bills_included: true, avg_response_ms: HOUR / 2, response_stats_at: FRESH }),
      { now: NOW },
    );
    expect(keys(rows)).toEqual([
      'highlightCommuteTitle',
      'highlightBillsTitle',
      'highlightResponseHourTitle',
    ]);
  });

  it('shrinks rather than substituting when bills are absent', () => {
    const rows = deriveListingHighlights(
      listing({ bills_included: false, avg_response_ms: HOUR / 2, response_stats_at: FRESH }),
      { now: NOW },
    );
    expect(keys(rows)).toEqual(['highlightCommuteTitle', 'highlightResponseHourTitle']);
  });

  it('renders commute alone when nothing else qualifies', () => {
    expect(keys(deriveListingHighlights(listing(), { now: NOW }))).toEqual([
      'highlightCommuteTitle',
    ]);
  });
});

describe('deriveListingHighlights — commute row', () => {
  it('uses the nearest faculty and the second-nearest as subtitle', () => {
    const [row] = deriveListingHighlights(listing(), { now: NOW });
    expect(row.icon).toBe('walk');
    expect(row.title.params).toEqual({ minutes: 17, faculty: 'Faculty of Agriculture' });
    expect(row.subtitle.params).toEqual({ minutes: 20, faculty: 'AUTH Central Library' });
  });

  it('sorts by walk time rather than trusting array order', () => {
    const scrambled = listing({
      faculty_distances: [fd('c', 40, 'C'), fd('a', 5, 'A'), fd('b', 12, 'B')],
    });
    const [row] = deriveListingHighlights(scrambled, { now: NOW });
    expect(row.title.params.faculty).toBe('A');
    expect(row.subtitle.params.faculty).toBe('B');
  });

  /*
    The spec's refinement: a student who filtered on Health Sciences does not
    care that the Library is closer. Their faculty wins over the nearest.
  */
  it('prefers the faculty the student arrived with', () => {
    const [row] = deriveListingHighlights(listing(), {
      selectedFacultyId: 'auth-medical',
      now: NOW,
    });
    expect(row.title.params).toEqual({ minutes: 35, faculty: 'Faculty of Health Sciences' });
  });

  // Otherwise a selected faculty could appear as its own runner-up.
  it('never repeats the chosen faculty in the subtitle', () => {
    const [row] = deriveListingHighlights(listing(), {
      selectedFacultyId: 'auth-medical',
      now: NOW,
    });
    expect(row.subtitle.params.faculty).not.toBe('Faculty of Health Sciences');
    expect(row.subtitle.params.faculty).toBe('Faculty of Agriculture');
  });

  it('falls back to nearest when the selected faculty has no row here', () => {
    const [row] = deriveListingHighlights(listing(), {
      selectedFacultyId: 'not-computed-for-this-listing',
      now: NOW,
    });
    expect(row.title.params.faculty).toBe('Faculty of Agriculture');
  });

  it('drops the subtitle when only one faculty is known', () => {
    const one = listing({ faculty_distances: [fd('solo', 9, 'Solo')] });
    const [row] = deriveListingHighlights(one, { now: NOW });
    expect(row.subtitle).toBeNull();
  });

  /*
    The spec says row 1 renders "always". It cannot claim a walk time it does
    not have, so a listing with no computed distances yields no commute row
    rather than a fabricated one. Defensive: faculty_distances is currently
    complete (39/39) and healed nightly by the recompute-distances cron.
  */
  it('omits the row entirely rather than inventing a distance', () => {
    expect(deriveListingHighlights(listing({ faculty_distances: [] }), { now: NOW })).toEqual([]);
    expect(deriveListingHighlights(listing({ faculty_distances: null }), { now: NOW })).toEqual([]);
  });

  it('ignores entries with a missing or non-numeric walk time', () => {
    const messy = listing({
      faculty_distances: [
        { faculty_id: 'x', faculty_name: 'X', walk_minutes: null },
        fd('y', 11, 'Y'),
      ],
    });
    const [row] = deriveListingHighlights(messy, { now: NOW });
    expect(row.title.params.faculty).toBe('Y');
    expect(row.subtitle).toBeNull();
  });

  it('does not mutate the input array', () => {
    const l = listing();
    const before = l.faculty_distances.map((f) => f.faculty_id);
    deriveListingHighlights(l, { now: NOW });
    expect(l.faculty_distances.map((f) => f.faculty_id)).toEqual(before);
  });
});

describe('deriveListingHighlights — response row', () => {
  it('renders for within_hour', () => {
    const rows = deriveListingHighlights(
      listing({ avg_response_ms: HOUR / 2, response_stats_at: FRESH }),
      { now: NOW },
    );
    expect(keys(rows)).toContain('highlightResponseHourTitle');
    expect(rows.at(-1).icon).toBe('message');
  });

  it('renders for within_day', () => {
    const rows = deriveListingHighlights(
      listing({ avg_response_ms: 5 * HOUR, response_stats_at: FRESH }),
      { now: NOW },
    );
    expect(keys(rows)).toContain('highlightResponseDayTitle');
  });

  /*
    responseTimeBucket also returns 'within_2_days'. It is deliberately NOT a
    highlight — "we usually reply within two days" is an apology, not a
    selling point. This is the gate the spec asks for, and prod listing
    0106001 sits in exactly this bucket (~33.7h).
  */
  it('does NOT render for within_2_days', () => {
    const rows = deriveListingHighlights(
      listing({ avg_response_ms: 33.7 * HOUR, response_stats_at: FRESH }),
      { now: NOW },
    );
    expect(keys(rows)).toEqual(['highlightCommuteTitle']);
  });

  it('does not render when the stat is unknown or stale', () => {
    const unknown = deriveListingHighlights(listing({ avg_response_ms: null }), { now: NOW });
    expect(keys(unknown)).toEqual(['highlightCommuteTitle']);

    const stale = deriveListingHighlights(
      listing({
        avg_response_ms: HOUR / 2,
        response_stats_at: new Date('2026-08-01T12:00:00Z').toISOString(),
      }),
      { now: NOW },
    );
    expect(keys(stale)).toEqual(['highlightCommuteTitle']);
  });
});

describe('deriveListingHighlights — bills row', () => {
  it('renders when bills are included', () => {
    const rows = deriveListingHighlights(listing({ bills_included: true }), { now: NOW });
    expect(keys(rows)).toEqual(['highlightCommuteTitle', 'highlightBillsTitle']);
    expect(rows[1].icon).toBe('euro');
  });

  /*
    The subtitle takes NO params on purpose. `bills_included` is a bare boolean
    with no record of WHICH bills, so naming them would invent a term of a real
    tenancy. If this ever takes params, a schema change came first.
  */
  it('carries no invented coverage detail', () => {
    const rows = deriveListingHighlights(listing({ bills_included: true }), { now: NOW });
    expect(rows[1].subtitle.params).toEqual({});
  });
});

describe('deriveListingHighlights — resilience', () => {
  it('survives a null or empty listing', () => {
    expect(deriveListingHighlights(null, { now: NOW })).toEqual([]);
    expect(deriveListingHighlights({}, { now: NOW })).toEqual([]);
  });

  it('works with no options at all', () => {
    expect(Array.isArray(deriveListingHighlights(listing()))).toBe(true);
  });
});
