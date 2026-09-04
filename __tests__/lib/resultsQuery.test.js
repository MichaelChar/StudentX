import { describe, it, expect } from 'vitest';

import {
  buildFilterParams,
  buildListingsQuery,
  initialFiltersFromParams,
  initialPageFromParams,
  isValidDateString,
  parseAmenityParam,
} from '@/lib/resultsQuery';

const sp = (qs) => new URLSearchParams(qs);
// A fixed clock. buildFilterParams widens the date window relative to "today",
// so a real clock would make these assertions expire overnight.
const TODAY = '2026-09-04';

describe('initialFiltersFromParams', () => {
  it('returns an empty search for an empty URL', () => {
    expect(initialFiltersFromParams(sp(''))).toEqual({
      minPrice: null,
      maxPrice: null,
      selectedTypes: [],
      selectedNeighborhoods: [],
      minDuration: null,
      selectedAmenities: [],
      availableFrom: '',
      flexDays: 0,
      moveIn: '',
      moveOut: '',
      facultyId: null,
      maxWalkMinutes: null,
    });
  });

  // Feature 8 made price a range; `budget=` is the pre-range param that the
  // quiz and old shared links still emit.
  it('seeds maxPrice from legacy budget=', () => {
    expect(initialFiltersFromParams(sp('budget=700')).maxPrice).toBe(700);
  });

  it('prefers max_budget over legacy budget when both are present', () => {
    const f = initialFiltersFromParams(sp('budget=700&max_budget=500'));
    expect(f.maxPrice).toBe(500);
  });

  it('ignores a non-positive or unparseable budget', () => {
    expect(initialFiltersFromParams(sp('budget=0')).maxPrice).toBeNull();
    expect(initialFiltersFromParams(sp('budget=abc')).maxPrice).toBeNull();
    expect(initialFiltersFromParams(sp('min_budget=-5')).minPrice).toBeNull();
  });

  it('accepts only the three real min_duration values', () => {
    expect(initialFiltersFromParams(sp('min_duration=5')).minDuration).toBe(5);
    expect(initialFiltersFromParams(sp('min_duration=7')).minDuration).toBeNull();
  });

  it('accepts only the offered flexibility values', () => {
    expect(initialFiltersFromParams(sp('flex=7')).flexDays).toBe(7);
    expect(initialFiltersFromParams(sp('flex=4')).flexDays).toBe(0);
  });

  it('rejects impossible dates, not just malformed ones', () => {
    expect(initialFiltersFromParams(sp('move_in=2026-02-31')).moveIn).toBe('');
    expect(initialFiltersFromParams(sp('move_in=2026-09-04')).moveIn).toBe('2026-09-04');
  });

  it('seeds moveIn from a legacy available_from', () => {
    const f = initialFiltersFromParams(sp('available_from=2026-09-04'));
    expect(f.moveIn).toBe('2026-09-04');
    expect(f.availableFrom).toBe('2026-09-04');
  });

  /*
    Shape-validated only, on purpose: an unknown faculty id is left alone so
    the API can reject it. Silently dropping a param the student can see in
    their own URL is worse than an empty grid that explains itself.
  */
  it('keeps a well-shaped faculty id it cannot verify', () => {
    expect(initialFiltersFromParams(sp('faculty=not-a-real-faculty')).facultyId).toBe(
      'not-a-real-faculty',
    );
    expect(initialFiltersFromParams(sp('faculty=Bad Id!')).facultyId).toBeNull();
  });

  it('accepts only the four walk-time buckets', () => {
    expect(initialFiltersFromParams(sp('max_walk_minutes=15')).maxWalkMinutes).toBe(15);
    expect(initialFiltersFromParams(sp('max_walk_minutes=12')).maxWalkMinutes).toBeNull();
  });
});

describe('parseAmenityParam', () => {
  it('reads the current amenities param', () => {
    expect(parseAmenityParam('AC,Balcony', null)).toEqual(['AC', 'Balcony']);
  });

  // Feature 7 turned negative dealbreakers into positive amenities. Old links
  // still carry the old param.
  it('translates legacy dealbreakers into amenity names', () => {
    expect(parseAmenityParam(null, 'unfurnished,no_ac')).toEqual(['Furnished', 'AC']);
  });

  it('drops a dealbreaker with no positive equivalent', () => {
    // `ground_floor` was removed outright — there is no "has ground floor" filter.
    expect(parseAmenityParam(null, 'ground_floor,no_ac')).toEqual(['AC']);
  });

  it('prefers amenities over dealbreakers when both are present', () => {
    expect(parseAmenityParam('Wi-Fi', 'unfurnished')).toEqual(['Wi-Fi']);
  });
});

describe('isValidDateString', () => {
  it('accepts a real date and rejects an impossible one', () => {
    expect(isValidDateString('2026-09-04')).toBe(true);
    expect(isValidDateString('2026-02-31')).toBe(false);
    expect(isValidDateString('04/09/2026')).toBe(false);
    expect(isValidDateString(null)).toBe(false);
  });
});

describe('buildFilterParams', () => {
  const base = initialFiltersFromParams(sp(''));

  it('sends nothing for an empty search', () => {
    expect(buildFilterParams(base, { today: TODAY }).toString()).toBe('');
  });

  /*
    `exclude_amenities` is a misnomer for "require ALL of these" — see
    lib/listingFilters.js. `Bills included` has its own flag and is split out.
  */
  it('splits Bills included out of the amenity list', () => {
    const f = { ...base, selectedAmenities: ['AC', 'Bills included'] };
    const p = buildFilterParams(f, { today: TODAY });
    expect(p.get('exclude_amenities')).toBe('AC');
    expect(p.get('require_bills_included')).toBe('true');
  });

  it('sends faculty alone, since it scopes rather than filters', () => {
    const p = buildFilterParams({ ...base, facultyId: 'law' }, { today: TODAY });
    expect(p.get('faculty')).toBe('law');
    expect(p.has('max_walk_minutes')).toBe(false);
  });

  it('never sends max_walk_minutes without a faculty — the API rejects that', () => {
    const p = buildFilterParams({ ...base, maxWalkMinutes: 15 }, { today: TODAY });
    expect(p.has('max_walk_minutes')).toBe(false);
  });

  // §15: flexibility widens BOTH ends of the window.
  it('widens the date window by the flexibility chip', () => {
    const f = { ...base, moveIn: '2026-10-10', moveOut: '2026-12-10', flexDays: 3 };
    const p = buildFilterParams(f, { today: TODAY });
    expect(p.get('move_in')).toBe('2026-10-07');
    expect(p.get('move_out')).toBe('2026-12-13');
  });

  it('falls back to available_from when there is no full range', () => {
    const f = { ...base, availableFrom: '2026-10-01' };
    const p = buildFilterParams(f, { today: TODAY });
    expect(p.get('available_from')).toBe('2026-10-01');
    expect(p.has('move_in')).toBe(false);
  });

  // The histogram deliberately drops price so above-budget supply stays
  // visible behind the marker (#218).
  it('omits budget when asked to', () => {
    const f = { ...base, minPrice: 300, maxPrice: 800 };
    expect(buildFilterParams(f, { today: TODAY }).get('max_budget')).toBe('800');
    expect(
      buildFilterParams(f, { includeBudget: false, today: TODAY }).has('max_budget'),
    ).toBe(false);
  });
});

/*
  THE POINT OF THIS FILE.

  The results page server-renders page one (issue #443) and the client decides
  whether to refetch by comparing its own query string against the server's. If
  the two ever build different strings for the same URL, every visitor pays for
  a redundant fetch and watches the grid change under them. So the round trip
  URL -> filters -> query is pinned here.
*/
describe('buildListingsQuery — the string the server and client must agree on', () => {
  const boundsToParams = (b) => ({ bounds: `${b.south},${b.west},${b.north},${b.east}` });

  function queryForUrl(qs) {
    const params = sp(qs);
    return buildListingsQuery({
      filters: initialFiltersFromParams(params),
      bounds: null,
      page: initialPageFromParams(params),
      today: TODAY,
      boundsToParams,
    }).toString();
  }

  it('always pins the sort and the page', () => {
    expect(queryForUrl('')).toBe('sort_by=price&sort_order=asc&page=1');
  });

  it('carries the page through from the URL', () => {
    expect(queryForUrl('page=3')).toContain('page=3');
  });

  it('is byte-identical for the same URL, twice', () => {
    const url = 'types=Studio&max_budget=600&amenities=AC,Balcony&faculty=law&max_walk_minutes=15';
    expect(queryForUrl(url)).toBe(queryForUrl(url));
  });

  it('translates a legacy dealbreaker URL the same way the client does', () => {
    expect(queryForUrl('dealbreakers=no_ac')).toContain('exclude_amenities=AC');
  });

  it('adds bounds only when there are bounds', () => {
    const params = sp('');
    const withBounds = buildListingsQuery({
      filters: initialFiltersFromParams(params),
      bounds: { south: 40.6, west: 22.9, north: 40.7, east: 23.0 },
      page: 1,
      today: TODAY,
      boundsToParams,
    });
    expect(withBounds.get('bounds')).toBe('40.6,22.9,40.7,23');
    expect(queryForUrl('')).not.toContain('bounds');
  });

  // A page the search cannot serve is the API's to clamp, not this builder's —
  // the client trusts the response's `page` over its own.
  it('passes an out-of-range page through rather than clamping it', () => {
    expect(queryForUrl('page=99')).toContain('page=99');
  });
});
