'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import ListingCard from '@/components/ListingCard';
import SaveSearchModal from '@/components/SaveSearchModal';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';

/*
  Propylaea results page — matches page 06 of the reference design.
  Left sticky filter panel ("Φίλτρα / FILTERS — Refine"), right column
  with Best match sort + LIST|MAP toggle, grid of ListingCard, and a
  featured programme banner at top when applicable.
*/

const PROPERTY_TYPES = ['Studio', '1-Bedroom', '2-Bedroom', 'Room in shared apartment'];
const BUDGET_MIN = 150;
const BUDGET_MAX = 1200;

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
  const [sortBy, setSortBy] = useState('match');
  const [viewMode, setViewMode] = useState(
    searchParams.get('view') === 'map' ? 'map' : 'list'
  );
  const [neighborhoodOptions, setNeighborhoodOptions] = useState([]);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [filtersMobileOpen, setFiltersMobileOpen] = useState(false);

  const [filters, setFilters] = useState({
    maxBudget: 900,
    selectedTypes: [],
    selectedNeighborhoods: [],
    verifiedOnly: false,
  });

  useEffect(() => {
    fetch('/api/neighborhoods')
      .then((r) => r.json())
      .then((d) => setNeighborhoodOptions(d.neighborhoods || []))
      .catch(() => {});
  }, []);

  // Seed filters from URL params on mount
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const budget = searchParams.get('budget');
    const types = searchParams.get('types');
    const neighborhoods = searchParams.get('neighborhoods');
    setFilters((prev) => ({
      ...prev,
      maxBudget: budget ? Number(budget) : prev.maxBudget,
      selectedTypes: types ? types.split(',') : [],
      selectedNeighborhoods: neighborhoods ? neighborhoods.split(',') : [],
    }));
  }, [searchParams]);

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

  useEffect(() => {
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

  const featured = listings.find((l) => l.is_featured);
  const regular = listings.filter((l) => !l.is_featured);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:py-14">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <p className="label-caps text-gold">{t('eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl text-night leading-tight">
            {t('titleTemplate', { count: loading ? 0 : listings.length })}
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
              {featured && !loading && (
                <FeaturedCard featured={featured} t={t} />
              )}

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

              {!loading && !error && regular.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {regular.map((listing) => (
                    <ListingCard
                      key={listing.listing_id}
                      listing={listing}
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
                    href="/quiz"
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

function FilterPanel({
  t,
  filters,
  neighborhoodOptions,
  onBudget,
  onToggleType,
  onToggleNeighborhood,
  onToggleVerified,
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

function FeaturedCard({ featured, t }) {
  return (
    <Card
      tone="night"
      className="mb-8 relative overflow-hidden bg-night text-stone p-8 md:p-10"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <p className="label-caps text-gold mb-3">
            {t('featuredTitle')}
          </p>
          <p className="font-display text-2xl md:text-3xl text-stone leading-tight max-w-lg">
            {t('featuredBody')}
          </p>
        </div>
        <Link
          href={`/listing/${featured.listing_id}`}
          className="label-caps text-gold hover:text-white transition-colors shrink-0"
        >
          {t('featuredCta')} →
        </Link>
      </div>
      <div
        aria-hidden="true"
        className="absolute -bottom-20 -right-16 w-72 h-72 rounded-full bg-gold/15 blur-2xl"
      />
    </Card>
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
