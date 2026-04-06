'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ListingCard from '@/components/ListingCard';

const ListingsMap = dynamic(() => import('@/components/ListingsMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-xl bg-gray-light animate-pulse flex items-center justify-center">
      <span className="text-gray-dark/40 text-sm">Loading map…</span>
    </div>
  ),
});

const SORT_OPTIONS = [
  { value: 'price', label: 'Price' },
];

const PROPERTY_TYPES = ['Studio', '1-Bedroom', '2-Bedroom', 'Room in shared apartment'];

const AMENITY_OPTIONS = ['AC', 'Furnished', 'Balcony', 'Elevator', 'Parking', 'Washing machine', 'Internet included', 'Heating'];

const BUDGET_MIN = 150;
const BUDGET_MAX = 1200;
const BUDGET_STEP = 50;

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-gray-light" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-6 w-20 bg-gray-light rounded" />
          <div className="h-4 w-16 bg-gray-light rounded" />
        </div>
        <div className="h-4 w-3/4 bg-gray-light rounded" />
        <div className="h-3 w-1/3 bg-gray-light rounded" />
        <div className="h-3 w-2/3 bg-gray-light rounded" />
        <div className="flex gap-1.5">
          <div className="h-5 w-12 bg-gray-light rounded-full" />
          <div className="h-5 w-16 bg-gray-light rounded-full" />
          <div className="h-5 w-14 bg-gray-light rounded-full" />
        </div>
      </div>
    </div>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortBy, setSortBy] = useState('price');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState([]);

  // Filter state (controlled independently from URL params from quiz)
  const [filters, setFilters] = useState({
    minBudget: '',
    maxBudget: '',
    selectedTypes: [],
    selectedNeighborhoods: [],
    selectedAmenities: [],
  });

  const faculty = searchParams.get('faculty') || '';

  // Fetch neighborhoods for filter
  useEffect(() => {
    fetch('/api/neighborhoods')
      .then((r) => r.json())
      .then((d) => setNeighborhoods(d.neighborhoods || []))
      .catch(() => {});
  }, []);

  // Seed filters from URL params on mount
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const budget = searchParams.get('budget');
    const types = searchParams.get('types');
    setFilters((prev) => ({
      ...prev,
      maxBudget: budget || '',
      selectedTypes: types ? types.split(',') : [],
    }));
  }, [searchParams]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (faculty) params.set('faculty', faculty);
      if (filters.maxBudget) params.set('max_budget', filters.maxBudget);
      if (filters.minBudget) params.set('min_budget', filters.minBudget);
      if (filters.selectedTypes.length > 0) params.set('types', filters.selectedTypes.join(','));
      if (filters.selectedNeighborhoods.length > 0) params.set('neighborhoods', filters.selectedNeighborhoods.join(','));

      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);

      const res = await fetch(`/api/listings?${params.toString()}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      let results = data.listings || [];

      // Client-side amenity filter (requires ALL selected amenities)
      if (filters.selectedAmenities.length > 0) {
        results = results.filter((l) => {
          const has = (l.amenities || []).map((a) => a.toLowerCase());
          return filters.selectedAmenities.every((a) => has.includes(a.toLowerCase()));
        });
      }

      // Dealbreaker filters from quiz
      const dealbreakers = searchParams.get('dealbreakers');
      if (dealbreakers) {
        const dbList = dealbreakers.split(',');
        for (const db of dbList) {
          if (db === 'ground_floor') {
            results = results.filter((l) =>
              !l.amenities?.some((a) => a.toLowerCase() === 'ground floor')
            );
          } else if (db === 'bills_not_included') {
            results = results.filter((l) => l.bills_included === true);
          }
        }
      }

      setListings(results);
    } catch {
      setError(true);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [faculty, filters, sortBy, sortOrder, searchParams]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  function handleSort(field) {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }

  function toggleFilter(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  }

  function clearFilters() {
    setFilters({ minBudget: '', maxBudget: '', selectedTypes: [], selectedNeighborhoods: [], selectedAmenities: [] });
  }

  const hasActiveFilters =
    filters.minBudget ||
    filters.maxBudget ||
    filters.selectedTypes.length > 0 ||
    filters.selectedNeighborhoods.length > 0 ||
    filters.selectedAmenities.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-navy tracking-tight">
            Available listings
          </h1>
          {!loading && (
            <p className="uppercase tracking-wider text-xs text-gray-dark/50 mt-1 font-heading">
              {listings.length} {listings.length === 1 ? 'result' : 'results'} found
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-navy text-white' : 'text-gray-dark/60 hover:bg-gray-light'}`}
              aria-pressed={viewMode === 'list'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${viewMode === 'map' ? 'bg-navy text-white' : 'text-gray-dark/60 hover:bg-gray-light'}`}
              aria-pressed={viewMode === 'map'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors cursor-pointer ${filtersOpen || hasActiveFilters ? 'border-gold bg-gold/5 text-gold' : 'border-gray-200 text-gray-dark/60 hover:border-gold/40'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707l-6.414 6.414A1 1 0 0014 13.828V20l-4-2v-4.172a1 1 0 00-.293-.707L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold text-white text-[10px] font-bold">
                {[filters.selectedTypes, filters.selectedNeighborhoods, filters.selectedAmenities].reduce((n, a) => n + a.length, 0) + (filters.minBudget ? 1 : 0) + (filters.maxBudget ? 1 : 0)}
              </span>
            )}
          </button>

          {/* Sort controls */}
          <span className="hidden sm:inline text-gray-dark/40 text-xs">|</span>
          <span className="text-gray-dark/50 text-sm hidden sm:inline">Sort:</span>
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortBy === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSort(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${isActive ? 'bg-navy text-white' : 'text-gray-dark/60 hover:bg-gray-light'}`}
              >
                {opt.label}{isActive && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Budget range */}
          <div>
            <h3 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-2">
              Price range
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min €"
                value={filters.minBudget}
                onChange={(e) => setFilters((p) => ({ ...p, minBudget: e.target.value }))}
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                className="w-full rounded-lg border border-gray-200 bg-gray-light px-3 py-2 text-sm text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
              />
              <span className="text-gray-dark/40 text-xs shrink-0">to</span>
              <input
                type="number"
                placeholder="Max €"
                value={filters.maxBudget}
                onChange={(e) => setFilters((p) => ({ ...p, maxBudget: e.target.value }))}
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                className="w-full rounded-lg border border-gray-200 bg-gray-light px-3 py-2 text-sm text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
              />
            </div>
          </div>

          {/* Property type */}
          <div>
            <h3 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-2">
              Property type
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleFilter('selectedTypes', type)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${filters.selectedTypes.includes(type) ? 'border-gold bg-gold/10 text-gold font-medium' : 'border-gray-200 text-gray-dark/60 hover:border-gold/40'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Neighborhoods */}
          <div>
            <h3 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-2">
              Neighborhood
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {neighborhoods.map((n) => (
                <button
                  key={n}
                  onClick={() => toggleFilter('selectedNeighborhoods', n)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${filters.selectedNeighborhoods.includes(n) ? 'border-gold bg-gold/10 text-gold font-medium' : 'border-gray-200 text-gray-dark/60 hover:border-gold/40'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Amenities */}
          <div>
            <h3 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-2">
              Amenities
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {AMENITY_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => toggleFilter('selectedAmenities', a)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${filters.selectedAmenities.includes(a) ? 'border-gold bg-gold/10 text-gold font-medium' : 'border-gray-200 text-gray-dark/60 hover:border-gold/40'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Clear button */}
          {hasActiveFilters && (
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <button
                onClick={clearFilters}
                className="text-sm text-gray-dark/50 hover:text-navy underline cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Map view */}
      {viewMode === 'map' && !loading && !error && (
        <div style={{ height: '60vh', minHeight: 400 }} className="mb-6">
          <ListingsMap listings={listings} />
        </div>
      )}

      {/* Loading skeleton */}
      {loading && viewMode === 'list' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="text-center py-20">
          <svg className="w-16 h-16 mx-auto text-red-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h2 className="font-heading text-xl font-semibold text-navy mb-2">Something went wrong</h2>
          <p className="text-gray-dark/60 mb-6">Please try again.</p>
          <button
            onClick={fetchListings}
            className="inline-block bg-gold text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-gold/90 transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {/* List view */}
      {!loading && !error && viewMode === 'list' && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {listings.map((listing) => (
            <ListingCard key={listing.listing_id} listing={listing} faculty={faculty} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && listings.length === 0 && (
        <div className="text-center py-20">
          <svg className="w-16 h-16 mx-auto text-gray-dark/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h2 className="font-heading text-xl font-semibold text-navy mb-2">No listings match your criteria</h2>
          <p className="text-gray-dark/60 mb-6">Try adjusting your filters.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-block bg-gold text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-gold/90 transition-colors cursor-pointer"
              >
                Clear filters
              </button>
            )}
            <Link href="/" className="inline-block bg-white border border-gray-200 text-navy font-heading font-semibold px-6 py-3 rounded-lg hover:border-gold/40 transition-colors">
              Back to search
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
          <div className="h-8 w-48 bg-gray-light rounded animate-pulse mb-8" />
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
