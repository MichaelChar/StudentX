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

// Dealbreakers were negative; amenities are positive. `ground_floor` has no
// positive equivalent — that filter was removed outright (Feature 7), and
// `Ground floor` stays a displayable amenity that simply is not filterable.
const LEGACY_DEALBREAKER_TO_AMENITY = {
  unfurnished: 'Furnished',
  no_ac: 'AC',
  bills_not_included: 'Bills included',
};

/*
  Reads the new `?amenities=` param, falling back to translating a legacy
  `?dealbreakers=` link. Kept for one release so shared URLs and the quiz's
  current output do not break the moment this ships.
*/
function parseAmenityParam(amenitiesRaw, dealbreakersRaw) {
  if (amenitiesRaw) return amenitiesRaw.split(',').filter(Boolean);
  if (!dealbreakersRaw) return [];
  return dealbreakersRaw
    .split(',')
    .map((d) => LEGACY_DEALBREAKER_TO_AMENITY[d])
    .filter(Boolean);
}

/*
  ONE param builder for all three consumers — the listings fetch, the price
  histogram, and the live `Show N places` count.

  They were three hand-rolled copies of the same translation, which is exactly
  how a count can end up disagreeing with the list it counts. `includeBudget`
  is the only real difference: the histogram deliberately drops price so
  above-budget supply stays visible behind the marker (#218), while the list
  and the count must both apply it.
*/
function buildFilterParams(filters, { includeBudget = true } = {}) {
  const params = new URLSearchParams();
  if (filters.selectedTypes.length > 0) params.set('types', filters.selectedTypes.join(','));
  if (filters.selectedNeighborhoods.length > 0)
    params.set('neighborhoods', filters.selectedNeighborhoods.join(','));
  if (filters.minDuration) params.set('min_duration', String(filters.minDuration));

  // `exclude_amenities` requires ALL of these (misnomer — see
  // lib/listingFilters.js). `Bills included` has its own dedicated flag, so it
  // is split out rather than sent as an amenity name.
  const amenities = filters.selectedAmenities.filter((a) => a !== 'Bills included');
  if (amenities.length > 0) params.set('exclude_amenities', amenities.join(','));
  if (filters.selectedAmenities.includes('Bills included'))
    params.set('require_bills_included', 'true');

  /*
    Widen by the flexibility chips before querying. `applyFlexDays` moves
    move-in back and move-out forward by N (§15: BOTH ends), clamped so a flexed
    move-in cannot land in the past. The stored range is left untouched, so the
    calendar keeps showing the dates the student actually clicked while the
    search covers the wider window.
  */
  const window = applyFlexDays(
    { moveIn: filters.moveIn, moveOut: filters.moveOut, flexDays: filters.flexDays || 0 },
    todayYmd(),
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

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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

function ResultsContent() {
  const t = useTranslations('propylaea.results');
  const locale = useLocale();
  const tSort = useTranslations('propylaea.results');
  const searchParams = useSearchParams();
  // The route is /property/[city]/results; the bar links back into the same city.
  const { city = 'thessaloniki' } = useParams();
  const router = useRouter();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const [filters, setFilters] = useState(() => {
    const budget = Number(searchParams.get('budget'));
    const minP = Number(searchParams.get('min_budget'));
    const maxP = Number(searchParams.get('max_budget'));
    const types = searchParams.get('types');
    const neighborhoods = searchParams.get('neighborhoods');
    const minDurationRaw = Number(searchParams.get('min_duration'));
    const minDuration = [1, 5, 9].includes(minDurationRaw) ? minDurationRaw : null;
    const dealbreakersRaw = searchParams.get('dealbreakers');
    const availableFromRaw = searchParams.get('available_from');
    const moveInRaw = searchParams.get('move_in') || availableFromRaw;
    const moveOutRaw = searchParams.get('move_out');
    return {
      // Feature 8 makes price a RANGE. Legacy `budget=` (single max) still
      // seeds maxPrice, so existing links and quiz output keep working.
      minPrice: Number.isFinite(minP) && minP > 0 ? minP : null,
      maxPrice: Number.isFinite(maxP) && maxP > 0
        ? maxP
        : (Number.isFinite(budget) && budget > 0 ? budget : null),
      selectedTypes: types ? types.split(',').filter(Boolean) : [],
      selectedNeighborhoods: neighborhoods ? neighborhoods.split(',').filter(Boolean) : [],
      minDuration,
      /*
        POSITIVE amenities, not dealbreakers (Feature 7). `no_ac` ("no AC is a
        dealbreaker") becomes `AC` ("has AC").

        The API needed no change for this: `exclude_amenities` is misnamed — it
        resolves through the `listings_with_all_amenities` RPC and means
        "require ALL of these". The old UI was already translating dealbreakers
        into required amenity names before sending them.
      */
      selectedAmenities: parseAmenityParam(searchParams.get('amenities'), dealbreakersRaw),
      // Legacy single available_from still seeds moveIn for shareable URLs.
      availableFrom: isValidDateString(availableFromRaw) ? availableFromRaw : '',
      // Feature 1's flexibility chips. A modifier on the search window, not
      // part of the clicked range — see applyFlexDays.
      flexDays: [0, 1, 2, 3, 7, 14].includes(Number(searchParams.get('flex')))
        ? Number(searchParams.get('flex'))
        : 0,
      moveIn: isValidDateString(moveInRaw) ? moveInRaw : '',
      moveOut: isValidDateString(moveOutRaw) ? moveOutRaw : '',
    };
  });

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
    const next = params.toString();
    const current = window.location.search.replace(/^\?/, '');
    if (next === current) return;
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [filters, viewMode]);

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
      const params = buildFilterParams(filters);
      // Feature 7 removes the sort control entirely. route.js already enforces
      // verified/featured-tier priority ahead of any sort_by, so the list order
      // is unchanged by dropping it.
      params.set('sort_by', 'price');
      params.set('sort_order', 'asc');

      const res = await fetch(`/api/listings?${params.toString()}`);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${detail}`);
      }
      const data = await res.json();
      setListings(data.listings || []);
    } catch (err) {
      console.error('fetchListings failed:', err);
      setError(true);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Fetch listings whenever the memoized fetchListings identity changes
  // (i.e. filters). Standard fetch-on-deps pattern; the inner
  // call updates state, which is intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchListings();
  }, [fetchListings]);

  function toggleIn(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  }

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
        <div>
          <p className="label-caps text-yellow">{t('eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl text-night leading-tight">
            {loading
              ? t('titleLoading')
              : t('titleTemplate', { count: listings.length })}
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
          {viewMode === 'map' && !loading && !error && (
            <div style={{ height: '70vh', minHeight: 420 }} className="lg:hidden mb-6 rounded-card overflow-hidden border border-night/10">
              <ListingsMap listings={listings} />
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
                    <ListingCard
                      key={listing.listing_id}
                      listing={listing}
                      fromQuery={searchParams.toString()}
                    />
                  ))}
                </div>
              )}

              {!loading && !error && listings.length === 0 && (
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
          {!loading && !error && (
            <div className="h-full rounded-card overflow-hidden border border-night/10">
              <ListingsMap listings={listings} />
            </div>
          )}
          {(loading || error) && (
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
export default function ResultsPage() {
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
      <ResultsContent />
    </Suspense>
  );
}
