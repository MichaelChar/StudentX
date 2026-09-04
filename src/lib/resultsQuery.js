import { applyFlexDays, todayYmd } from '@/lib/dateRange';
import { parsePageParam } from '@/lib/listingPagination';

/*
  URL -> filter state -> query string, for the results page.

  All three steps were inline in the results page while that page was entirely
  client-rendered. Issue #443 server-renders the first page, which means the
  SERVER now has to build byte-for-byte the same query the client would have
  built on mount — otherwise the HTML a crawler sees describes a different
  search from the one the browser then runs, and the student watches the grid
  change under them.

  So these are pure functions in a lib, with tests, rather than two
  implementations that agree today.
*/

// Dealbreakers were negative; amenities are positive. `ground_floor` has no
// positive equivalent — that filter was removed outright (Feature 7), and
// `Ground floor` stays a displayable amenity that simply is not filterable.
const LEGACY_DEALBREAKER_TO_AMENITY = {
  unfurnished: 'Furnished',
  no_ac: 'AC',
  bills_not_included: 'Bills included',
};

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/*
  `amenities=` is the current param. `dealbreakers=` is the pre-Feature-7 one,
  still honoured so old links and any quiz output in the wild keep working.
*/
export function parseAmenityParam(amenitiesRaw, dealbreakersRaw) {
  // No trimming, deliberately: this is a verbatim move of the results page's
  // own parser (issue #443). `?amenities=AC, Wi-Fi` has always kept the space
  // and therefore matched nothing, and a refactor is the wrong place to change
  // what a URL means.
  if (amenitiesRaw) return amenitiesRaw.split(',').filter(Boolean);
  if (!dealbreakersRaw) return [];
  return dealbreakersRaw
    .split(',')
    .map((d) => LEGACY_DEALBREAKER_TO_AMENITY[d])
    .filter(Boolean);
}

/**
 * Seed the results page's filter state from the URL.
 *
 * @param {URLSearchParams} searchParams
 */
export function initialFiltersFromParams(searchParams) {
  const get = (k) => searchParams.get(k);
  const budget = Number(get('budget'));
  const minP = Number(get('min_budget'));
  const maxP = Number(get('max_budget'));
  const types = get('types');
  const neighborhoods = get('neighborhoods');
  const minDurationRaw = Number(get('min_duration'));
  const minDuration = [1, 5, 9].includes(minDurationRaw) ? minDurationRaw : null;
  const dealbreakersRaw = get('dealbreakers');
  const availableFromRaw = get('available_from');
  const moveInRaw = get('move_in') || availableFromRaw;
  const moveOutRaw = get('move_out');

  return {
    // Feature 8 makes price a RANGE. Legacy `budget=` (single max) still seeds
    // maxPrice, so existing links and quiz output keep working.
    minPrice: Number.isFinite(minP) && minP > 0 ? minP : null,
    maxPrice:
      Number.isFinite(maxP) && maxP > 0
        ? maxP
        : Number.isFinite(budget) && budget > 0
          ? budget
          : null,
    selectedTypes: types ? types.split(',').filter(Boolean) : [],
    selectedNeighborhoods: neighborhoods
      ? neighborhoods.split(',').filter(Boolean)
      : [],
    minDuration,
    /*
      POSITIVE amenities, not dealbreakers (Feature 7). `no_ac` ("no AC is a
      dealbreaker") becomes `AC` ("has AC").

      The API needed no change for this: `exclude_amenities` is misnamed — it
      resolves through the `listings_with_all_amenities` RPC and means "require
      ALL of these". The old UI was already translating dealbreakers into
      required amenity names before sending them.
    */
    selectedAmenities: parseAmenityParam(get('amenities'), dealbreakersRaw),
    // Legacy single available_from still seeds moveIn for shareable URLs.
    availableFrom: isValidDateString(availableFromRaw) ? availableFromRaw : '',
    // Feature 1's flexibility chips. A modifier on the search window, not part
    // of the clicked range — see applyFlexDays.
    flexDays: [0, 1, 2, 3, 7, 14].includes(Number(get('flex')))
      ? Number(get('flex'))
      : 0,
    moveIn: isValidDateString(moveInRaw) ? moveInRaw : '',
    moveOut: isValidDateString(moveOutRaw) ? moveOutRaw : '',
    /*
      Commute (S15). Seeded from the URL so a shared "within 15 min of my
      faculty" link reproduces that search, and so the quiz can hand a faculty
      straight to results.

      Only shape-validated here — an unknown faculty id is left alone rather
      than dropped. The API validates it properly, and silently discarding a
      param the student can see in their own URL is worse than an empty grid
      that explains itself.
    */
    facultyId: /^[a-z0-9-]+$/.test(get('faculty') || '') ? get('faculty') : null,
    maxWalkMinutes: [10, 15, 20, 30].includes(Number(get('max_walk_minutes')))
      ? Number(get('max_walk_minutes'))
      : null,
  };
}

/**
 * Filter state -> the params every listing-ish endpoint takes.
 *
 * `today` is injected rather than read here so the caller decides the clock.
 * The results page renders this on the server AND in the browser; if the two
 * read the clock independently either side of midnight they would build
 * different windows and the page would refetch for no reason.
 */
export function buildFilterParams(filters, { includeBudget = true, today } = {}) {
  const params = new URLSearchParams();
  if (filters.selectedTypes.length > 0) params.set('types', filters.selectedTypes.join(','));
  if (filters.selectedNeighborhoods.length > 0)
    params.set('neighborhoods', filters.selectedNeighborhoods.join(','));
  if (filters.minDuration) params.set('min_duration', String(filters.minDuration));

  /*
    Commute (S15). `faculty` alone SCOPES which distance the API returns — it
    deliberately excludes nothing — so sending it is safe even with no walk
    limit, and it is what makes the card meta line show the student's own
    faculty rather than the nearest two.

    `max_walk_minutes` is the part that actually narrows the results, and the
    API rejects it without a faculty, so it is only sent alongside one.
  */
  if (filters.facultyId) {
    params.set('faculty', filters.facultyId);
    if (filters.maxWalkMinutes) {
      params.set('max_walk_minutes', String(filters.maxWalkMinutes));
    }
  }

  // `exclude_amenities` requires ALL of these (misnomer — see
  // lib/listingFilters.js). `Bills included` has its own dedicated flag, so it
  // is split out rather than sent as an amenity name.
  const amenities = filters.selectedAmenities.filter((a) => a !== 'Bills included');
  if (amenities.length > 0) params.set('exclude_amenities', amenities.join(','));
  if (filters.selectedAmenities.includes('Bills included'))
    params.set('require_bills_included', 'true');

  /*
    Widen by the flexibility chips before querying. `applyFlexDays` moves
    move-in back and move-out forward by N (§15: BOTH ends), clamped so a
    flexed move-in cannot land in the past. The stored range is left untouched,
    so the calendar keeps showing the dates the student actually clicked while
    the search covers the wider window.
  */
  const window = applyFlexDays(
    { moveIn: filters.moveIn, moveOut: filters.moveOut, flexDays: filters.flexDays || 0 },
    today ?? todayYmd(),
  );
  if (window.moveIn && window.moveOut) {
    params.set('move_in', window.moveIn);
    params.set('move_out', window.moveOut);
  } else if (filters.availableFrom) {
    params.set('available_from', filters.availableFrom);
  }

  if (includeBudget) {
    if (filters.minPrice) params.set('min_budget', String(filters.minPrice));
    if (filters.maxPrice) params.set('max_budget', String(filters.maxPrice));
  }
  return params;
}

/**
 * The full query the results grid fetches — filters, fixed sort, map bounds
 * and page. This is the string the server and the client must agree on.
 *
 * @param {object} args
 * @param {object} args.filters      from initialFiltersFromParams
 * @param {object|null} args.bounds  from parseBoundsParams
 * @param {number} args.page
 * @param {string} [args.today]      injected clock, see buildFilterParams
 * @param {(b: object) => object} [args.boundsToParams] the mapBounds encoder
 */
export function buildListingsQuery({ filters, bounds, page, today, boundsToParams }) {
  const params = buildFilterParams(filters, { today });
  // Feature 7 removes the sort control entirely. The search already enforces
  // verified/featured-tier priority ahead of any sort_by, so the list order is
  // unchanged by dropping the control.
  params.set('sort_by', 'price');
  params.set('sort_order', 'asc');

  // Feature 14 — quantised so the URL, the request and the edge-cache key are
  // all the same string.
  if (bounds && boundsToParams) {
    for (const [k, v] of Object.entries(boundsToParams(bounds))) {
      params.set(k, v);
    }
  }

  // Feature 15 — sending `page` is what opts this caller into pagination; the
  // search leaves other consumers (DirectoryCarousel, the canary) on the
  // full-list response.
  params.set('page', String(page));
  return params;
}

/** The page the results grid should open on, from the URL. */
export function initialPageFromParams(searchParams) {
  return parsePageParam(searchParams.get('page'));
}
