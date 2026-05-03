'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import ListingCard from '@/components/ListingCard';
import SaveSearchModal from '@/components/SaveSearchModal';
import Button from '@/components/ui/Button';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import GlobeLoader from '@/components/GlobeLoader';

/*
  Propylaea results page — matches page 06 of the reference design.
  Left sticky filter panel ("Φίλτρα / FILTERS — Refine"), right column
  with Best match sort + LIST|MAP toggle, grid of ListingCard, and a
  featured programme banner at top when applicable.
*/

const PROPERTY_TYPES = ['Studio', '1-Bedroom', '2-Bedroom', 'Room in shared apartment'];
const BUDGET_MIN = 150;
const BUDGET_MAX = 1200;
const DEFAULT_BUDGET = 900;

function MapLoadingFallback() {
  return (
    <div className="h-full w-full rounded-sm bg-parchment animate-pulse flex items-center justify-center">
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
    <div className="rounded-sm border border-night/10 bg-white overflow-hidden animate-pulse">
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
  const tSort = useTranslations('propylaea.results');
  const searchParams = useSearchParams();
  const router = useRouter();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Globe loader (post-quiz transition). Shown only when arriving with quiz
  // params (budget/types/neighborhoods present) on first mount of the page —
  // never on filter-driven re-fetches. Sequence runs ~6.5s; we hide the
  // loader only after the animation completes AND listings are loaded so
  // there's no jarring skeleton flash mid-zoom. We resolve `showLoader` in
  // an effect (not the initializer) so SSR doesn't lock us into `false`.
  const [loaderDone, setLoaderDone] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const loaderDecidedRef = useRef(false);
  // One-time loader-gate decision based on URL params at mount. We
  // INTENTIONALLY don't use a `useState(() => ...)` lazy initializer
  // here because that would run server-side too — `typeof window` is
  // undefined during SSR, so the lazy init returns `false`, but the
  // client run returns `true` for users coming from the quiz, causing
  // a hydration mismatch warning + layout flash. useEffect defers the
  // decision to AFTER hydration, so SSR + first client paint agree on
  // `false` and the loader fades in cleanly. See the line-72 comment
  // above for the broader sequencing rationale.
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
  const [sortBy, setSortBy] = useState(() => {
    const s = searchParams.get('sort_by');
    return s === 'price' || s === 'priceDesc' ? s : 'match';
  });
  const [viewMode, setViewMode] = useState(
    searchParams.get('view') === 'map' ? 'map' : 'list'
  );
  const [neighborhoodOptions, setNeighborhoodOptions] = useState([]);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [filtersMobileOpen, setFiltersMobileOpen] = useState(false);

  const [filters, setFilters] = useState(() => {
    const budget = Number(searchParams.get('budget'));
    const types = searchParams.get('types');
    const neighborhoods = searchParams.get('neighborhoods');
    const minDurationRaw = Number(searchParams.get('min_duration'));
    const minDuration = [1, 5, 9].includes(minDurationRaw) ? minDurationRaw : null;
    return {
      maxBudget: Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET,
      selectedTypes: types ? types.split(',').filter(Boolean) : [],
      selectedNeighborhoods: neighborhoods ? neighborhoods.split(',').filter(Boolean) : [],
      verifiedOnly: searchParams.get('verified_only') === 'true',
      minDuration,
    };
  });

  useEffect(() => {
    fetch('/api/neighborhoods')
      .then((r) => r.json())
      .then((d) => setNeighborhoodOptions(d.neighborhoods || []))
      .catch(() => {});
  }, []);

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
    if (filters.maxBudget !== DEFAULT_BUDGET) params.set('budget', String(filters.maxBudget));
    if (filters.selectedTypes.length > 0)
      params.set('types', filters.selectedTypes.join(','));
    if (filters.selectedNeighborhoods.length > 0)
      params.set('neighborhoods', filters.selectedNeighborhoods.join(','));
    if (filters.verifiedOnly) params.set('verified_only', 'true');
    if (filters.minDuration) params.set('min_duration', String(filters.minDuration));
    if (sortBy !== 'match') params.set('sort_by', sortBy);
    if (viewMode === 'map') params.set('view', 'map');
    const next = params.toString();
    const current = window.location.search.replace(/^\?/, '');
    if (next === current) return;
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [filters, sortBy, viewMode]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (filters.maxBudget) params.set('max_budget', String(filters.maxBudget));
      if (filters.selectedTypes.length > 0)
        params.set('types', filters.selectedTypes.join(','));
      if (filters.selectedNeighborhoods.length > 0)
        params.set('neighborhoods', filters.selectedNeighborhoods.join(','));
      if (filters.verifiedOnly) params.set('verified_only', 'true');
      if (filters.minDuration) params.set('min_duration', String(filters.minDuration));
      // 'match' is the UI default; the API enforces verified/featured tier
      // priority in route.js regardless of sort_by, so 'match' collapses to
      // 'price' asc.
      params.set('sort_by', 'price');
      params.set('sort_order', sortBy === 'priceDesc' ? 'desc' : 'asc');

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
  }, [filters, sortBy]);

  // Fetch listings whenever the memoized fetchListings identity changes
  // (i.e. filters, sortBy). Standard fetch-on-deps pattern; the inner
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

  // Show loader as a full-screen overlay until BOTH animation completes
  // AND the initial listings fetch has finished. Both conditions guard
  // against jank: the loader hides only when there's something legible
  // to reveal beneath it.
  const loaderVisible = showLoader && (!loaderDone || loading);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:py-14">
      {loaderVisible && <GlobeLoader onComplete={() => setLoaderDone(true)} />}
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <p className="label-caps text-gold">{t('eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl text-night leading-tight">
            {loading
              ? t('titleLoading')
              : t('titleTemplate', { count: listings.length })}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none label-caps bg-transparent border border-night/20 text-night pl-4 pr-9 py-2 rounded-sm cursor-pointer focus:outline-none focus:border-blue"
            >
              <option value="match">{t('sortBestMatch')}</option>
              <option value="price">{t('sortPriceAsc')}</option>
              <option value="priceDesc">{t('sortPriceDesc')}</option>
            </select>
            <Icon
              name="chevronDown"
              className="w-3.5 h-3.5 text-night/50 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
          </div>

          {/* List / Map toggle */}
          <div
            className="flex items-stretch border border-night/20 rounded-sm overflow-hidden"
            role="group"
            aria-label="View mode"
          >
            <button
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`label-caps px-3 py-2 flex items-center gap-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-night text-white'
                  : 'text-night/60 hover:text-night'
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
                  : 'text-night/60 hover:text-night'
              }`}
            >
              <Icon name="map" className="w-4 h-4" /> {t('viewMap')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
        {/* Filter panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <FilterPanel
              t={t}
              filters={filters}
              neighborhoodOptions={neighborhoodOptions}
              onBudget={(v) => setFilters((p) => ({ ...p, maxBudget: v }))}
              onToggleType={(v) => toggleIn('selectedTypes', v)}
              onToggleNeighborhood={(v) => toggleIn('selectedNeighborhoods', v)}
              onToggleVerified={() =>
                setFilters((p) => ({ ...p, verifiedOnly: !p.verifiedOnly }))
              }
              onSetMinDuration={(v) =>
                setFilters((p) => ({ ...p, minDuration: v }))
              }
              onSaveSearch={() => setSaveSearchOpen(true)}
            />
          </div>
        </aside>

        {/* Mobile filter drawer trigger */}
        <div className="lg:hidden">
          <Button variant="outline" onClick={() => setFiltersMobileOpen(true)}>
            <Icon name="filter" className="w-4 h-4" />
            {t('filtersEnglish')}
          </Button>
        </div>

        {/* Main content */}
        <div>
          {/* Map view */}
          {viewMode === 'map' && !loading && !error && (
            <div style={{ height: '70vh', minHeight: 420 }} className="mb-6 rounded-sm overflow-hidden border border-night/10">
              <ListingsMap listings={listings} />
            </div>
          )}

          {/* List view */}
          {viewMode === 'list' && (
            <>
              {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
                    href="/property/quiz"
                    className="label-caps text-blue hover:text-night"
                  >
                    Retake the quiz →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {filtersMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-night/60"
            onClick={() => setFiltersMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[85%] max-w-sm bg-stone p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <span className="label-caps text-night">
                {t('filtersEnglish')}
              </span>
              <button
                onClick={() => setFiltersMobileOpen(false)}
                aria-label="Close filters"
                className="p-1 text-night/60"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <FilterPanel
              t={t}
              filters={filters}
              neighborhoodOptions={neighborhoodOptions}
              onBudget={(v) => setFilters((p) => ({ ...p, maxBudget: v }))}
              onToggleType={(v) => toggleIn('selectedTypes', v)}
              onToggleNeighborhood={(v) => toggleIn('selectedNeighborhoods', v)}
              onToggleVerified={() =>
                setFilters((p) => ({ ...p, verifiedOnly: !p.verifiedOnly }))
              }
              onSetMinDuration={(v) =>
                setFilters((p) => ({ ...p, minDuration: v }))
              }
              onSaveSearch={() => setSaveSearchOpen(true)}
            />
          </aside>
        </div>
      )}

      {saveSearchOpen && (
        <SaveSearchModal
          filters={filters}
          faculty={''}
          onClose={() => setSaveSearchOpen(false)}
        />
      )}
    </div>
  );
}

const MIN_DURATION_OPTIONS = [
  { value: 1, nameKey: 'minDurationFlexibleName', monthsKey: 'minDurationFlexibleMonths' },
  { value: 5, nameKey: 'minDurationSemesterName', monthsKey: 'minDurationSemesterMonths' },
  { value: 9, nameKey: 'minDurationAcademicName', monthsKey: 'minDurationAcademicMonths' },
];

function FilterPanel({
  t,
  filters,
  neighborhoodOptions,
  onBudget,
  onToggleType,
  onToggleNeighborhood,
  onToggleVerified,
  onSetMinDuration,
  onSaveSearch,
}) {
  const neighborhoods = neighborhoodOptions.length > 0
    ? neighborhoodOptions
    : ['Kentro', 'Ano Poli', 'Analipsi', 'Kalamaria', 'Toumba', 'Faliro'];

  return (
    <div>
      <p className="font-display italic text-night/60 text-base">
        {t('filtersGreek')}
      </p>
      <p className="label-caps text-night/80 mt-1 mb-6">
        {t('filtersEnglish')} &middot; {t('filtersRefine')}
      </p>

      {/* Max price */}
      <section className="mb-8">
        <p className="label-caps text-night/60 mb-3">{t('maxPrice')}</p>
        <p className="font-display text-2xl text-blue">
          {t('upTo')} €{filters.maxBudget}
          <span className="text-sm text-night/50">/mo</span>
        </p>
        <input
          type="range"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={25}
          value={filters.maxBudget}
          onChange={(e) => onBudget(Number(e.target.value))}
          className="w-full mt-3"
          aria-label={t('maxPrice')}
        />
      </section>

      {/* Neighborhood */}
      <section className="mb-8">
        <p className="label-caps text-night/60 mb-3">{t('neighborhood')}</p>
        <div className="flex flex-wrap gap-1.5">
          {neighborhoods.map((n) => {
            const active = filters.selectedNeighborhoods.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => onToggleNeighborhood(n)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-sm border text-xs font-sans transition-colors ${
                  active
                    ? 'border-blue bg-blue text-white'
                    : 'border-night/20 text-night/70 hover:border-blue'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </section>

      {/* Type */}
      <section className="mb-8">
        <p className="label-caps text-night/60 mb-3">{t('type')}</p>
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_TYPES.map((type) => {
            const active = filters.selectedTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => onToggleType(type)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-sm border text-xs font-sans transition-colors ${
                  active
                    ? 'border-blue bg-blue text-white'
                    : 'border-night/20 text-night/70 hover:border-blue'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </section>

      {/* Stay length */}
      <section className="mb-8">
        <p className="label-caps text-night/60 mb-3">{t('minDuration')}</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSetMinDuration(null)}
            aria-pressed={filters.minDuration === null}
            className={`px-2.5 py-1 rounded-sm border text-xs font-sans transition-colors ${
              filters.minDuration === null
                ? 'border-blue bg-blue text-white'
                : 'border-night/20 text-night/70 hover:border-blue'
            }`}
          >
            {t('minDurationAny')}
          </button>
          {MIN_DURATION_OPTIONS.map((opt) => {
            const active = filters.minDuration === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSetMinDuration(active ? null : opt.value)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded-sm border font-sans transition-colors text-left leading-tight ${
                  active
                    ? 'border-blue bg-blue text-white'
                    : 'border-night/20 text-night/70 hover:border-blue'
                }`}
              >
                <span className="block text-xs">{t(opt.nameKey)}</span>
                <span className="block text-[10px] opacity-60">{t(opt.monthsKey)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Verified only */}
      <section className="mb-8">
        <button
          type="button"
          onClick={onToggleVerified}
          aria-pressed={filters.verifiedOnly}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-sm border text-xs font-sans transition-colors ${
            filters.verifiedOnly
              ? 'border-gold bg-gold text-white'
              : 'border-night/20 text-night/70 hover:border-gold'
          }`}
        >
          <Icon name="shieldCheck" className="w-4 h-4" />
          {t('verified')} only
        </button>
      </section>

      <button
        type="button"
        onClick={onSaveSearch}
        className="label-caps text-blue hover:text-night transition-colors"
      >
        + Save this search
      </button>
    </div>
  );
}

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
