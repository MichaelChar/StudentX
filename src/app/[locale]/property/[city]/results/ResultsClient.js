'use client';

import { useEffect, useState, useCallback, useMemo, Suspense, useRef } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';

import ListingCard from '@/components/ListingCard';
import Button from '@/components/ui/Button';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import Chip from '@/components/ui/Chip';
import FiltersModal from '@/components/property/FiltersModal';
import HeaderSearch from '@/components/property/HeaderSearch';
import DateRangePicker from '@/components/property/DateRangePicker';
import SearchThisAreaButton from '@/components/property/SearchThisAreaButton';
import MapAreaEmptyState from '@/components/property/MapAreaEmptyState';
import ResultsPagination from '@/components/property/ResultsPagination';
import CommuteFilterChip from '@/components/property/CommuteFilterChip';
import { applyFlexDays, todayYmd } from '@/lib/dateRange';
import { clearFilters } from '@/lib/filtersModal';
import { formatPropertyType } from '@/lib/propertyType';
import BauhausLoader from '@/components/BauhausLoader';
import {
  buildPriceHistogram,
  maxBucketCount,
  isBucketInBudget,
} from '@/lib/priceHistogram';
import { formatMoney } from '@/lib/formatMoney';
import {
  parseBoundsParams,
  boundsToParams,
  boundsDrift,
  BOUNDS_DRIFT_THRESHOLD,
} from '@/lib/mapBounds';
import {
  buildFilterParams,
  buildListingsQuery,
  initialFiltersFromParams,
  initialPageFromParams,
} from '@/lib/resultsQuery';

/*
  Propylaea results page — matches page 06 of the reference design.
  Left sticky filter panel ("Filters — Refine"), right column
  with Best match sort + LIST|MAP toggle, grid of ListingCard, and a
  featured programme banner at top when applicable.
*/

const PROPERTY_TYPE_GROUPS = [
  { labelKey: 'typeStudio1Bed', values: ['Studio', '1-Bedroom'] },
  { labelKey: 'type2Bed', values: ['2-Bedroom'] },
  { labelKey: 'typeEntirePlace', values: ['Entire place'] },
  { labelKey: 'typePrivateRoom', values: ['Room in shared apartment'] },
  { labelKey: 'typeBedInSharedRoom', values: ['Bed in shared room'] },
];
// Floor matches the quiz slider (src/app/.../quiz/page.js) so the two
// surfaces agree on the minimum selectable budget.
const BUDGET_MIN = 250;
const BUDGET_MAX = 1200;
const DEFAULT_BUDGET = 900;
// Number of bars in the budget-distribution histogram (see src/lib/priceHistogram.js).
const HISTOGRAM_BUCKETS = 12;

// Accepts a real YYYY-MM-DD date string; rejects bad shapes and impossible
// dates (e.g. 2026-02-31). Mirrors the API's available_from validator so the
// client never seeds state or fires a request the route would 400.
/*
  Feature 7's approved chip row: ten amenities pulled from the 19 the
  `amenities` table already holds, chosen for density and recognisability.
  The remaining nine live behind the modal's `Show more`.

  Values are the amenity NAMES the API matches on — `exclude_amenities` is a
  misnomer for "require all of these" (see lib/listingFilters.js), so these go
  over the wire verbatim.
*/
/*
  The full 19 the `amenities` table holds. Order matters: the modal splits at
  ten, so CHIP_AMENITIES must be the first ten of this list for the row and the
  modal's preview to agree.
*/
const ALL_AMENITIES = [
  'Furnished',
  'AC',
  'Bills included',
  'Washing machine',
  'Wi-Fi',
  'Elevator',
  'Parking',
  'Balcony',
  'Heating',
  'Dishwasher',
  'Internet included',
  'TV',
  'Kitchen',
  'Double-glazed windows',
  'Weekly cleaning',
  'Microwave',
  'Oven',
  'Gas heating',
  'Private yard',
];

const CHIP_AMENITIES = [
  'Furnished',
  'AC',
  'Bills included',
  'Washing machine',
  'Wi-Fi',
  'Elevator',
  'Parking',
  'Balcony',
  'Heating',
  'Dishwasher',
];


/*
  Reads the new `?amenities=` param, falling back to translating a legacy
  `?dealbreakers=` link. Kept for one release so shared URLs and the quiz's
  current output do not break the moment this ships.
*/
function MapLoadingFallback() {
  return (
    <div className="h-full w-full rounded-control bg-parchment animate-pulse flex items-center justify-center">
      <span className="text-night/40 text-sm">Loading map…</span>
    </div>
  );
}

const ListingsMap = dynamic(() => import('@/components/ListingsMap'), {
  ssr: false,
  loading: () => <MapLoadingFallback />,
});

function SkeletonCard() {
  return (
    <div className="rounded-control border border-night/10 bg-white overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-parchment" />
      <div className="p-5 space-y-3">
        <div className="h-3 w-28 bg-parchment rounded" />
        <div className="h-5 w-3/4 bg-parchment rounded" />
        <div className="flex justify-between">
          <div className="h-3 w-20 bg-parchment rounded" />
          <div className="h-4 w-16 bg-parchment rounded" />
        </div>
      </div>
    </div>
  );
}

function ResultsContent({ initialData, initialQuery }) {
  const t = useTranslations('propylaea.results');
  const locale = useLocale();
  const tSort = useTranslations('propylaea.results');
  const searchParams = useSearchParams();
  // The route is /property/[city]/results; the bar links back into the same city.
  const { city = 'thessaloniki' } = useParams();
  const router = useRouter();

  /*
    Seeded from the server render (issue #443). The grid used to start empty
    and fill in from a useEffect, which is why `curl` on this URL returned a
    page with no listings in it and pagination's SEO rationale went unmet.

    `initialData` is the SAME payload /api/listings returns, produced by the
    same `searchListings` call, so nothing below this line had to learn a new
    shape.
  */
  const servedQueryRef = useRef(initialQuery ?? null);
  const [listings, setListings] = useState(() => initialData?.listings ?? []);
  const [loading, setLoading] = useState(() => !initialData);
  const [error, setError] = useState(false);
  // Post-quiz loader. Shown only when arriving with quiz params
  // (budget/types/neighborhoods) on first mount — never on filter re-fetches.
  const [showLoader, setShowLoader] = useState(false);
  const loaderDecidedRef = useRef(false);
  // Deferred to useEffect (not useState initializer) to avoid SSR/client
  // hydration mismatch — see loaderDecidedRef guard.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (loaderDecidedRef.current) return;
    loaderDecidedRef.current = true;
    if (typeof window === 'undefined') return;
    // Read the URL directly. useSearchParams() can interact awkwardly with
    // the Suspense boundary that wraps this component on first paint, so we
    // sidestep it for the loader gate.
    const usp = new URLSearchParams(window.location.search);
    const cameFromQuiz =
      usp.has('budget') || usp.has('types') || usp.has('neighborhoods');
    if (cameFromQuiz) setShowLoader(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [viewMode, setViewMode] = useState(
    searchParams.get('view') === 'map' ? 'map' : 'list'
  );
  const [neighborhoodOptions, setNeighborhoodOptions] = useState([]);
  const [priceDistribution, setPriceDistribution] = useState([]);
  // Feature 7: the sidebar is gone, so every non-chip filter lives in here.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Feature 9: `Show N places`, refreshed on every toggle before Apply.
  const [pendingCount, setPendingCount] = useState(null);

  /*
    Map-bounds search (parity Feature 14). Three separate pieces, because they
    answer three different questions:

      activeBounds   the box the CURRENT RESULTS were fetched for. null = the
                     whole city. This is the only one that reaches the API or
                     the URL.
      mapBounds      where the map is looking RIGHT NOW, debounced.
      searchBaseline where the map was looking when results were last fetched.

    activeBounds and searchBaseline look redundant and are not: after
    `Search all of Thessaloniki`, activeBounds is null (query the whole city)
    while searchBaseline is the viewport the student is still sitting in, so
    drift is measured from what they can see rather than from nothing.

    Seeded from the URL so a shared "search this area" link reproduces the
    same box. Invalid bounds in a hand-edited URL degrade to a whole-city
    search rather than erroring on a browsing page — the API validates too,
    and it is the one that returns a 400.
  */
  const [activeBounds, setActiveBounds] = useState(
    () => parseBoundsParams(searchParams).bounds ?? null,
  );
  const [mapBounds, setMapBounds] = useState(null);

  /*
    Feature 15 — numbered pagination, 18/page. Seeded from the URL so a shared
    or bookmarked link lands on the same page, and so returning from a listing
    restores the page the student was on rather than the top of the list.
  */
  const [page, setPage] = useState(() => initialPageFromParams(searchParams));
  const [totalPages, setTotalPages] = useState(() => initialData?.total_pages ?? 1);
  /*
    Total across ALL pages, not the length of the current one.

    The heading reads "N listings in Thessaloniki". Before pagination that was
    `listings.length`, which was the whole result set; with 18/page it silently
    became "the size of this page" — a 40-result search would have announced
    "18 listings" on page 1 and "4 listings" on page 3. Caught in the browser
    at 2/page, where it read "2 listings" over 3 real ones.
  */
  const [totalCount, setTotalCount] = useState(
    () => initialData?.total ?? initialData?.listings?.length ?? 0,
  );
  const [searchBaseline, setSearchBaseline] = useState(
    () => parseBoundsParams(searchParams).bounds ?? null,
  );

  const [filters, setFilters] = useState(() => initialFiltersFromParams(searchParams));

  /*
    Faculties for the commute chip. Fetched once — the list is static reference
    data (13 rows) and /api/faculties is cached for a day. Failure leaves the
    array empty, which the chip renders as a loading line rather than an empty
    popover.
  */
  const [faculties, setFaculties] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/faculties');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFaculties(data.faculties || []);
      } catch {
        // Chip stays in its loading state; the rest of the page is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetch('/api/neighborhoods')
      .then((r) => r.json())
      .then((d) => setNeighborhoodOptions(d.neighborhoods || []))
      .catch(() => {});
  }, []);

  // Price distribution for the budget histogram — reflects the student's
  // current search EXCEPT budget (issue #218). Budget stays a purely
  // client-side marker overlay (see aboveBudgetCount + the histogram below),
  // so this refetches only when a NON-budget filter changes, never when the
  // budget slider moves. Prices-only + cached per filter-combo at the edge, so
  // re-fetching on each narrow is cheap, and the chart shows how much supply
  // sits ABOVE the student's budget within their current search.
  const fetchDistribution = useCallback(async () => {
    try {
      const params = buildFilterParams(filters, { includeBudget: false });
      const qs = params.toString();
      const res = await fetch(`/api/listings/price-distribution${qs ? `?${qs}` : ''}`);
      if (!res.ok) return; // keep the last good distribution on error
      const d = await res.json();
      setPriceDistribution(Array.isArray(d.prices) ? d.prices : []);
    } catch {
      // Network error — keep the last good distribution.
    }
    /*
      Deliberately granular, NOT `[filters]`. buildFilterParams reads the whole
      object, but this fetch must not re-run when price changes — the histogram
      keeps above-budget supply visible behind the marker (#218), so a price
      edit would refetch for a chart that ignores price. Every non-price field
      the builder touches IS listed here; adding one to the builder means
      adding it here too.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.selectedTypes,
    filters.selectedNeighborhoods,
    filters.minDuration,
    filters.selectedAmenities,
    filters.availableFrom,
    filters.moveIn,
    filters.moveOut,
  ]);

  // Debounced refetch when the non-budget filters change (coalesces rapid
  // multi-toggles), mirroring the listings fetch. fetchDistribution's identity
  // is stable across budget-only changes, so dragging the slider never fires.
  useEffect(() => {
    const id = setTimeout(fetchDistribution, 300);
    return () => clearTimeout(id);
  }, [fetchDistribution]);

  // Sync filter/sort/view state INTO the URL so refresh + share + back
  // preserve what the user picked. The initial state is seeded from the
  // URL above, so this effect is a no-op on first render and writes only
  // on actual user changes. Uses replaceState (not router.replace) so we
  // don't trigger an unnecessary RSC re-render — the listing fetch reads
  // from local state, not useSearchParams. Note: the URL params here are
  // the user-facing names (budget/types/neighborhoods), not the API names
  // (max_budget); fetchListings translates between them.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (filters.minPrice) params.set('min_budget', String(filters.minPrice));
    if (filters.maxPrice) params.set('max_budget', String(filters.maxPrice));
    if (filters.selectedTypes.length > 0)
      params.set('types', filters.selectedTypes.join(','));
    if (filters.selectedNeighborhoods.length > 0)
      params.set('neighborhoods', filters.selectedNeighborhoods.join(','));
    if (filters.minDuration) params.set('min_duration', String(filters.minDuration));
    // Written as `amenities=`; `dealbreakers=` is still READ on load for a
    // release, but never written back — links heal to the new vocabulary.
    if (filters.selectedAmenities.length > 0)
      params.set('amenities', filters.selectedAmenities.join(','));
    if (filters.flexDays) params.set('flex', String(filters.flexDays));
    if (filters.moveIn && filters.moveOut) {
      params.set('move_in', filters.moveIn);
      params.set('move_out', filters.moveOut);
    } else if (filters.moveIn) {
      params.set('move_in', filters.moveIn);
    } else if (filters.availableFrom) {
      params.set('available_from', filters.availableFrom);
    }
    if (viewMode === 'map') params.set('view', 'map');
    // Feature 14 — bounds in the URL keep a map-scoped search shareable and
    // back-safe, in the same quantised form the API parses.
    if (activeBounds) {
      for (const [k, v] of Object.entries(boundsToParams(activeBounds))) {
        params.set(k, v);
      }
    }
    // Page 1 is the default, so it stays out of the URL — a clean /results is
    // page 1, and `?page=1` would be a second URL for the same content.
    if (page > 1) params.set('page', String(page));
    if (filters.facultyId) {
      params.set('faculty', filters.facultyId);
      if (filters.maxWalkMinutes) {
        params.set('max_walk_minutes', String(filters.maxWalkMinutes));
      }
    }
    const next = params.toString();
    const current = window.location.search.replace(/^\?/, '');
    if (next === current) return;
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    /*
      Pass the EXISTING state through, never `null`.

      `replaceState(null, ...)` does not merely leave history.state alone — it
      overwrites it, destroying whatever was there, including Next App Router's
      own `__PRIVATE_NEXTJS_INTERNALS_TREE`. Next repopulates it, so nothing
      visibly breaks, but "the framework puts it back" is not a guarantee to
      build on.

      It has already cost real time once: S8 (#433) originally tracked open
      overlays by stamping a marker into history.state, and this line was one
      of the two things erasing it. S8 now keeps ownership in a module-level
      map instead (see components/ui/overlay/history.js), so it no longer
      depends on this — but the URL sync has no reason to be clearing state it
      does not own.

      Same pattern the overlay module already uses for its own push.
    */
    window.history.replaceState(window.history.state, '', url);
  }, [filters, viewMode, activeBounds, page]);

/*
    Feature 9 — `Show N places`, refreshed on every toggle BEFORE anything is
    applied. Uses the same builder as the list, so the count and the list can
    never disagree about what a filter means. Debounced 300ms, mirroring
    fetchDistribution; the endpoint is edge-cached per filter combination.
  */
  /*
    PROPERTY_TYPE_GROUPS is `{ labelKey, values }`, where one group can cover
    several type names (Studio + 1-Bedroom shared a sidebar chip). The modal
    toggles ONE value per option, so the groups are flattened here — the
    caller's job, as the modal's own notes point out.

    Flattening is also the better list: "Studio" and "1-Bedroom" as separate
    rows is clearer in a filter list than a combined chip, and it matches how
    Airbnb's `Type of place` reads.
  */
  const propertyTypeOptions = useMemo(
    () =>
      PROPERTY_TYPE_GROUPS.flatMap((g) =>
        g.values.map((v) => ({ value: v, label: formatPropertyType(v, locale) })),
      ),
    [locale],
  );

  const toggleAmenity = useCallback((amenity) => {
    setFilters((p) => ({
      ...p,
      selectedAmenities: p.selectedAmenities.includes(amenity)
        ? p.selectedAmenities.filter((a) => a !== amenity)
        : [...p.selectedAmenities, amenity],
    }));
  }, []);

  // Counts only what the chip row does NOT already show, so the badge tells the
  // student how much is hidden behind the modal rather than restating the row.
  const activeFilterCount =
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    filters.selectedTypes.length +
    filters.selectedNeighborhoods.length +
    (filters.minDuration ? 1 : 0) +
    filters.selectedAmenities.filter((a) => !CHIP_AMENITIES.includes(a)).length;

  const fetchPendingCount = useCallback(async (draft) => {
    try {
      const qs = buildFilterParams(draft).toString();
      const res = await fetch(`/api/listings/count-filtered${qs ? `?${qs}` : ''}`);
      if (!res.ok) return;
      const d = await res.json();
      setPendingCount(typeof d.count === 'number' ? d.count : null);
    } catch {
      // Leave the last known count rather than flashing a wrong one.
    }
  }, []);

  const [draftFilters, setDraftFilters] = useState(filters);

  /*
    Draft sync happens on OPEN, in the handler — not in an effect. Seeding it
    from an effect trips `react-hooks/set-state-in-effect` and deserves to: it
    would render the modal once with the previous session's toggles before
    correcting. Doing it here means that frame never exists, and a dismissed
    session cannot leak into the next one.
  */
  const openFilters = useCallback(() => {
    setDraftFilters(filters);
    setPendingCount(null);
    setFiltersOpen(true);
  }, [filters]);

  // Only the debounced fetch lives in the effect; the setState happens inside
  // the timeout callback, which is not a synchronous effect-body update.
  useEffect(() => {
    if (!filtersOpen) return;
    const id = setTimeout(() => fetchPendingCount(draftFilters), 300);
    return () => clearTimeout(id);
  }, [filtersOpen, draftFilters, fetchPendingCount]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = buildListingsQuery({
        filters,
        bounds: activeBounds,
        page,
        boundsToParams,
      });
      const qs = params.toString();

      const res = await fetch(`/api/listings?${qs}`);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${detail}`);
      }
      const data = await res.json();
      setListings(data.listings || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(
        typeof data.total === 'number' ? data.total : (data.listings || []).length,
      );
      /*
        Trust the API's clamped page over our own. `?page=99` on a 2-page
        search comes back as page 2 with page-2 results; if the URL kept
        saying 99 the pagination control would highlight a page that does not
        exist and Next would refetch the same clamp forever.
      */
      if (typeof data.page === 'number' && data.page !== page) setPage(data.page);
      // What the grid is now showing, so the mount effect below can tell
      // "already have this" from "looks the same but isn't".
      servedQueryRef.current = qs;
    } catch (err) {
      console.error('fetchListings failed:', err);
      setError(true);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [filters, activeBounds, page]);

  /*
    Fetch listings whenever the filters, bounds or page change — EXCEPT when
    the resulting query is the one the grid is already showing.

    That exception is what stops the server-rendered first page (issue #443)
    from being thrown away and immediately refetched on mount. The comparison
    is on the query STRING, so it is exact: if the server and the client
    disagree about a single param, the client fetches and wins, and the worst
    case is the behaviour we had before.

    The ref, not a boolean "did I mount": a student who toggles a filter on and
    then off again arrives back at the initial query with the grid showing the
    intermediate results. Comparing against "what did I last serve" refetches
    there; comparing against "is this mount" would leave the wrong listings on
    screen.

    Computed HERE rather than during render because buildListingsQuery reads
    the clock, and an impure call in a render body is what the React Compiler
    rule forbids.

    `fetchListings` is deliberately not guarded itself — the error state's
    `Try again` button calls it directly and must always refetch.
  */
  useEffect(() => {
    const qs = buildListingsQuery({
      filters,
      bounds: activeBounds,
      page,
      boundsToParams,
    }).toString();
    if (qs === servedQueryRef.current) return;
    fetchListings();
  }, [filters, activeBounds, page, fetchListings]);

  function toggleIn(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  }

  /*
    Feature 13 — the ONE piece of shared hover state, lifted to the common
    parent that Feature 11's split layout already gave us. A card and its pin
    live in two different subtrees, so the correspondence has to be owned
    above both.

    Deliberately not context and not a store: it is a single nullable id whose
    only consumers are directly below this component. A provider for it would
    be more moving parts than the feature has.
  */
  const [hoveredListingId, setHoveredListingId] = useState(null);

  /*
    Feature 14 — the map-move handler, debounced 300ms to match the two
    existing debounces on this page (fetchDistribution and fetchPendingCount).

    What the 300ms governs here is DIFFERENT, and worth being explicit about:
    it delays when the `Search this area` button is allowed to APPEAR, not when
    anything refetches. Nothing touches the API until the student clicks. The
    debounce exists so the button does not flicker in and out while a pan is
    still settling.

    Leaflet's `moveend` has already coalesced the gesture; this coalesces the
    momentum scroll that can follow it on a trackpad.
  */
  const pendingViewportRef = useRef(null);
  const [viewportTick, setViewportTick] = useState(0);

  const handleViewportChange = useCallback((bounds, { userInitiated } = {}) => {
    pendingViewportRef.current = { bounds, userInitiated };
    setViewportTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!pendingViewportRef.current) return undefined;
    const id = setTimeout(() => {
      const { bounds, userInitiated } = pendingViewportRef.current;
      setMapBounds(bounds);
      /*
        A settle the student did NOT cause — initial layout, the sticky column
        being measured — re-baselines silently, so it can never be mistaken for
        a pan and offer `Search this area` on page load. A real gesture leaves
        the baseline alone so the drift it created is what the button reacts to.

        Done inside the timeout rather than in its own effect because as a
        separate effect it is a synchronous setState in an effect body, which
        this repo's React Compiler lint rules reject.
      */
      setSearchBaseline((prev) => (userInitiated && prev ? prev : bounds));
    }, 300);
    return () => clearTimeout(id);
  }, [viewportTick]);

  /*
    Any change to WHAT is being searched resets to page 1. Staying on page 4
    while the filters change means landing on page 4 of a different, possibly
    shorter result set — usually an empty grid that reads as "no matches" when
    there are plenty on page 1.

    Deliberately keyed on filters + bounds and NOT on `page` itself, or every
    page change would immediately reset itself.
  */
  const resultSetKey = useMemo(
    () => JSON.stringify([filters, activeBounds]),
    [filters, activeBounds],
  );
  const [seenResultSetKey, setSeenResultSetKey] = useState(resultSetKey);
  if (seenResultSetKey !== resultSetKey) {
    /*
      Adjusting state during render — React's documented pattern for deriving
      state from a change, and the reason it is state rather than a ref: this
      repo's React Compiler rules reject reading or writing a ref during
      render, and an effect would be a synchronous setState in an effect body,
      which they also reject. React re-renders before committing, so there is
      no wasted paint.
    */
    setSeenResultSetKey(resultSetKey);
    if (page !== 1) setPage(1);
  }

  const searchThisArea = useCallback(() => {
    if (!mapBounds) return;
    setActiveBounds(mapBounds);
    setSearchBaseline(mapBounds);
  }, [mapBounds]);

  // `Search all of Thessaloniki` — drop the box, keep the baseline at what the
  // student is actually looking at so the button does not immediately re-offer.
  const searchWholeCity = useCallback(() => {
    setActiveBounds(null);
    setSearchBaseline(mapBounds);
  }, [mapBounds]);

  const showSearchThisArea =
    boundsDrift(searchBaseline, mapBounds) > BOUNDS_DRIFT_THRESHOLD;


  // The empty grid only means "nothing in THIS BOX" when a box is applied.
  // Without one it is the ordinary no-matches case, and telling a student to
  // zoom out would be advice that cannot help them.
  const boundsEmpty = !loading && !error && listings.length === 0 && activeBounds !== null;
  /*
    Same reasoning as boundsEmpty: when the COMMUTE limit is what emptied the
    grid, the generic "try widening your budget or selecting more
    neighborhoods" is actively wrong — the student narrowed by walk time and
    neither budget nor neighborhood is why they see nothing. Naming the real
    cause, and offering the control that caused it, is the difference between
    an explicable empty state and a dead end.

    Ordered after boundsEmpty so a map-scoped search still explains itself as
    a map problem; both at once is rare and the map is the more recent action.
  */
  const commuteEmpty =
    !loading
    && !error
    && listings.length === 0
    && !boundsEmpty
    && Boolean(filters.facultyId)
    && Boolean(filters.maxWalkMinutes);

  const loaderVisible = showLoader && loading;

  // Derived (pure) — bucket the price distribution for the current search
  // (all non-budget filters applied, budget ignored) so the chart shows how
  // much supply sits ABOVE the student's budget within what they're browsing,
  // not just the in-budget slice already in the list below. Falls back to the
  // fetched (budget-filtered) listings only while the distribution endpoint
  // hasn't answered yet / if it failed.
  const histogramSource = priceDistribution.length > 0
    ? priceDistribution.map((p) => ({ monthly_price: p }))
    : listings;
  const priceHistogram = buildPriceHistogram(histogramSource, {
    min: BUDGET_MIN,
    max: BUDGET_MAX,
    buckets: HISTOGRAM_BUCKETS,
  });
  // How many listings in the current search cost more than the budget —
  // recomputed client-side against the (filtered) distribution as the slider
  // moves, surfaced as an explicit line under the chart so the tradeoff is legible.
  const aboveBudgetCount = filters.maxPrice
    ? priceDistribution.filter((p) => p > filters.maxPrice).length
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:py-14">
      {loaderVisible && (
        <BauhausLoader
          mode="overlay"
          eyebrow={t('eyebrow')}
          statuses={[t('titleLoading')]}
        />
      )}
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        {/*
          `pr-24` below `sm` keeps the title clear of the floating account pill
          (`AccountMenu`, fixed top-11 right-5). At 375px the pill occupies
          x 275–355 and this h1 ran to x=350, so `3 listings in Thessaloniki`
          had its last word sitting under a blurred pill. 96px of padding wraps
          it a word earlier instead.

          Dropped at `sm`, where the row turns horizontal and the title block
          stops spanning the full width. Founder's call (2026-09-04): reserve
          space per page rather than shrink or drop the pill on mobile — the
          pill's panel is still the only route to /resources, /gigs and
          /student/ausom, which the two-tab logged-out bar does not carry.
        */}
        <div className="pr-24 sm:pr-0">
          <p className="label-caps text-yellow">{t('eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl text-night leading-tight">
            {/*
              When a map box is what emptied the grid, the generic
              "No matches for these filters" actively contradicts the empty
              state directly beneath it, which says the area is the reason.
              Same count, different cause, so it needs its own line.
            */}
            {loading
              ? t('titleLoading')
              : boundsEmpty
                ? t('titleEmptyArea')
                : commuteEmpty
                  ? t('commuteEmptyTitle', { minutes: filters.maxWalkMinutes })
                  : t('titleTemplate', { count: totalCount })}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/*
            Feature 11 — the toggle is MOBILE ONLY now. On desktop the grid and
            the map are both permanently visible, so a toggle there would only
            let a student hide half of their own results. `view=` survives as
            the mobile control and nothing else.
          */}
          <div
            className="flex items-stretch border border-night/20 rounded-control overflow-hidden lg:hidden"
            role="group"
            aria-label="View mode"
          >
            <button
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`label-caps px-3 py-2 flex items-center gap-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-night text-white'
                  : 'text-night/60 hover:text-night active:text-night/80'
              }`}
            >
              <Icon name="list" className="w-4 h-4" /> {t('viewList')}
            </button>
            <button
              onClick={() => setViewMode('map')}
              aria-pressed={viewMode === 'map'}
              className={`label-caps px-3 py-2 flex items-center gap-1.5 transition-colors ${
                viewMode === 'map'
                  ? 'bg-night text-white'
                  : 'text-night/60 hover:text-night active:text-night/80'
              }`}
            >
              <Icon name="map" className="w-4 h-4" /> {t('viewMap')}
            </button>
          </div>
        </div>
      </div>

      {/*
        Feature 1 + 2 — the search bar, collapsed to a pill on results. This is
        also where move-in/move-out get a UI again: Feature 7 removed the
        sidebar's date inputs and sent them here, so between #428 and this PR a
        student could only set dates from a URL or the quiz.

        Dates commit straight into `filters`, so the grid, the histogram and the
        live count all refetch through the same path as every other filter.
      */}
      <div className="mb-6">
        <HeaderSearch
          collapsed
          city={city}
          dates={{
            moveIn: filters.moveIn,
            moveOut: filters.moveOut,
            flexDays: filters.flexDays || 0,
          }}
          onDatesChange={(next) =>
            setFilters((p) => ({
              ...p,
              moveIn: next.moveIn,
              moveOut: next.moveOut,
              flexDays: next.flexDays,
              // A picked range supersedes the legacy single-date param; leaving
              // it set would keep narrowing the query behind the student's back.
              availableFrom: next.moveIn ? '' : p.availableFrom,
            }))
          }
          renderDatePanel={({ value, onChange }) => (
            <DateRangePicker value={value} onChange={onChange} />
          )}
        />
      </div>

      {/*
        Feature 7 — the chip row replaces the sidebar entirely. Ten amenities
        the `amenities` table already holds, horizontally scrollable, with
        `Filters` pinned LEFT so it never scrolls out of reach. Everything the
        chips do not cover lives in the modal.
      */}
      <div className="mb-8 flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={openFilters}
          className="shrink-0 gap-2"
        >
          <Icon name="filter" className="h-4 w-4" />
          {t('filtersEnglish')}
          {activeFilterCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-night px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {/*
          Commute (S15) — pinned LEFT of the scrolling amenities, next to
          Filters, because it is the one filter that is StudentX's own.

          Airbnb's row is amenities only, which is exactly how the
          differentiator fell out of the UI when the sidebar went (Feature 7):
          `faculty_distances` is precomputed and healed nightly by a cron, the
          API has always supported `faculty`, and yet no control anywhere let a
          student choose one. Parity does not mean deleting the thing Airbnb
          has no equivalent for — see spec §5.2.

          Outside the scroll container on purpose: a student who never
          horizontally scrolls must still see it.
        */}
        <div className="shrink-0">
          <CommuteFilterChip
            faculties={faculties}
            value={{
              facultyId: filters.facultyId,
              maxMinutes: filters.maxWalkMinutes,
            }}
            onChange={(next) =>
              setFilters((p) => ({
                ...p,
                facultyId: next.facultyId,
                maxWalkMinutes: next.maxMinutes,
              }))
            }
          />
        </div>

        {/* `overflow-x-auto` not a wrap: Airbnb's row scrolls, and wrapping ten
            chips would push the grid down a line on narrow desktops. */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHIP_AMENITIES.map((amenity) => (
            <Chip
              key={amenity}
              selected={filters.selectedAmenities.includes(amenity)}
              onClick={() => toggleAmenity(amenity)}
            >
              {amenity}
            </Chip>
          ))}
        </div>
      </div>

      {/*
        Feature 11 — desktop results are a 2-column card grid (~62%) beside a
        sticky full-height map (~38%), both always visible. Below `lg` the two
        stay mutually exclusive and the toggle above picks between them, which
        is the only place `view=` still means anything.

        The map column is `sticky` rather than `fixed` so it stops at the
        footer instead of floating over it, and it is the RIGHT column so a
        student reading cards left-to-right is not interrupted by it.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[62fr_38fr] lg:items-start gap-10">

        {/* Main content */}
        <div className="min-w-0">
          {/* Map — mobile only; the desktop map is the sticky column. */}
          {/* Same reasoning as the desktop column: mounted through `loading` so
              a search cannot reset the student's viewport. */}
          {viewMode === 'map' && !error && (
            <div style={{ height: '70vh', minHeight: 420 }} className="relative lg:hidden mb-6 rounded-card overflow-hidden border border-night/10">
              <ListingsMap
                listings={listings}
                hoveredListingId={hoveredListingId}
                onPinHover={setHoveredListingId}
                onViewportChange={handleViewportChange}
              />
              <SearchThisAreaButton
                visible={showSearchThisArea}
                onClick={searchThisArea}
                loading={loading}
              />
            </div>
          )}

          {/* Cards. Always rendered on desktop; on mobile only in list view. */}
          <div className={viewMode === 'map' ? 'hidden lg:block' : undefined}>
              {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              )}

              {!loading && error && (
                <div className="text-center py-20">
                  <p className="font-display text-2xl text-night mb-3">
                    Something went wrong.
                  </p>
                  <Button onClick={fetchListings} variant="gold">
                    Try again
                  </Button>
                </div>
              )}

              {!loading && !error && listings.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {listings.map((listing) => (
                    /*
                      CARD → PIN. A plain wrapper, NOT a prop on ListingCard:
                      the card is a server component, and giving it mouse
                      handlers would mean marking it 'use client' across every
                      other surface that renders it.

                      Safe against the card's stretched-link pattern too —
                      mouseenter/mouseleave bubble from the children regardless
                      of the z-0 link overlay, so nothing here competes for the
                      click the way a z-10 control would.
                    */
                    <div
                      key={listing.listing_id}
                      onMouseEnter={() => setHoveredListingId(listing.listing_id)}
                      onMouseLeave={() => setHoveredListingId(null)}
                    >
                      <ListingCard
                        listing={listing}
                        fromQuery={searchParams.toString()}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/*
                Feature 15 — numbered pagination, not infinite scroll. Renders
                nothing at one page. Sits below the grid so the site footer
                stays reachable, which is half the point of not using infinite
                scroll.
              */}
              {!loading && !error && listings.length > 0 && (
                <ResultsPagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={(next) => {
                    setPage(next);
                    // Airbnb returns you to the top of the results on a page
                    // change; landing mid-grid on page 2 reads as a broken jump.
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              )}

              {/* Trap C from the spec: at current inventory a half-screen pan
                  returns zero results, and a blank grid reads as "we have
                  nothing" rather than "nothing HERE". The bounds case gets its
                  own copy and its own one-click way out. */}
              {boundsEmpty && <MapAreaEmptyState onReset={searchWholeCity} />}

              {commuteEmpty && (
                <div className="text-center py-20">
                  <p className="font-display text-2xl text-night mb-2">
                    {t('commuteEmptyTitle', { minutes: filters.maxWalkMinutes })}
                  </p>
                  <p className="text-night/60 mb-6">
                    {t('commuteEmptyBody', {
                      faculty:
                        faculties.find((f) => f.id === filters.facultyId)?.name
                        ?? t('commuteChip'),
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((p) => ({ ...p, maxWalkMinutes: null }))
                    }
                    className="label-caps text-blue hover:text-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue rounded-control"
                  >
                    {t('commuteEmptyAction')} &rarr;
                  </button>
                </div>
              )}

              {!loading && !error && listings.length === 0 && !boundsEmpty && !commuteEmpty && (
                <div className="text-center py-20">
                  <p className="font-display text-2xl text-night mb-2">
                    No matches yet.
                  </p>
                  <p className="text-night/60 mb-6">
                    Try widening your budget or selecting more neighborhoods.
                  </p>
                  <Link
                    href="/property/thessaloniki/quiz"
                    className="label-caps text-blue hover:text-night"
                  >
                    Retake the quiz →
                  </Link>
                </div>
              )}
          </div>
        </div>

        {/*
          The sticky map column. `h-[calc(100vh-3rem)]` with `top-6` keeps it
          exactly one viewport tall with the page's own gutter above it, so it
          never scrolls internally against the page.

          Known limitation, accepted per Feature 11: at current inventory this
          is 38% of the viewport holding three pins. Structurally correct, not
          yet doing useful work — it earns its space as listings grow.
        */}
        <aside className="hidden lg:block lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          {/*
            Mounted through `loading`, NOT gated on it.

            The map used to live behind `{!loading && ...}`, which unmounted and
            remounted it on every fetch — and a remounted MapContainer starts at
            the default centre and zoom. That was survivable when the map only
            reflected results; with Feature 14 it breaks the feature outright:
            the student pans somewhere, hits `Search this area`, and the map
            jumps back to the city centre while the URL still describes the box
            they can no longer see. Observed, then fixed.

            `listings` is not cleared until the new response lands, so the
            previous pins stay put during the fetch instead of flashing empty.

            `relative` anchors the Search-this-area control, which sits over the
            tiles at z-[1000] — above Leaflet's own panes, which top out ~700.
          */}
          {!error ? (
            <div className="relative h-full rounded-card overflow-hidden border border-night/10">
              <ListingsMap
                listings={listings}
                hoveredListingId={hoveredListingId}
                onPinHover={setHoveredListingId}
                onViewportChange={handleViewportChange}
              />
              <SearchThisAreaButton
                visible={showSearchThisArea}
                onClick={searchThisArea}
                loading={loading}
              />
            </div>
          ) : (
            <div className="h-full rounded-card border border-night/10 bg-parchment" />
          )}
        </aside>
      </div>


      <FiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={draftFilters}
        onChange={setDraftFilters}
        onApply={() => {
          setFilters(draftFilters);
          setFiltersOpen(false);
        }}
        onClearAll={() => setDraftFilters(clearFilters(draftFilters))}
        resultCount={pendingCount}
        distribution={priceDistribution}
        propertyTypes={propertyTypeOptions}
        neighborhoods={neighborhoodOptions}
        amenities={ALL_AMENITIES}
      />
    </div>
  );
}

const MIN_DURATION_OPTIONS = [
  { value: 1, nameKey: 'minDurationFlexibleName', monthsKey: 'minDurationFlexibleMonths' },
  { value: 5, nameKey: 'minDurationSemesterName', monthsKey: 'minDurationSemesterMonths' },
  { value: 9, nameKey: 'minDurationAcademicName', monthsKey: 'minDurationAcademicMonths' },
];

const DEALBREAKER_LABEL_KEYS = {
  ground_floor: 'dbGroundFloor',
  unfurnished: 'dbUnfurnished',
  no_ac: 'dbNoAc',
  bills_not_included: 'dbBillsNotIncluded',
};

/*
  Compact price-distribution histogram shown above the budget slider. Bars are
  bucketed client-side from the current search's price distribution — all
  non-budget filters applied, budget ignored, not just the in-budget result set
  (see src/lib/priceHistogram.js). Bars within budget render in blue; bars above
  the chosen budget are greyed, and a vertical marker shows where the budget cut
  lands, so above-budget supply is visible. Pure presentation — all bucketing
  happens in the helper.
*/
export default function ResultsClient({ initialData, initialQuery }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div className="h-8 w-48 bg-parchment rounded animate-pulse mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      }
    >
      <ResultsContent initialData={initialData} initialQuery={initialQuery} />
    </Suspense>
  );
}
