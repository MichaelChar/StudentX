'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ListingCard from '@/components/ListingCard';

const SORT_OPTIONS = [
  { value: 'price', label: 'Price' },
  { value: 'walk_minutes', label: 'Walk time' },
  { value: 'transit_minutes', label: 'Transit time' },
];

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
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortBy, setSortBy] = useState('price');
  const [sortOrder, setSortOrder] = useState('asc');

  const faculty = searchParams.get('faculty') || '';

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (faculty) params.set('faculty', faculty);
      const budget = searchParams.get('budget');
      if (budget) params.set('max_budget', budget);
      const types = searchParams.get('types');
      if (types) params.set('types', types);
      const duration = searchParams.get('duration');
      if (duration) params.set('duration', duration);

      // Map dealbreakers: some go to the API as required amenities,
      // others need client-side filtering
      const dealbreakers = searchParams.get('dealbreakers');
      const clientFilters = [];
      if (dealbreakers) {
        const dbList = dealbreakers.split(',');
        const requiredAmenities = [];
        for (const db of dbList) {
          switch (db) {
            case 'no_ac':
              requiredAmenities.push('AC');
              break;
            case 'unfurnished':
              requiredAmenities.push('Furnished');
              break;
            case 'ground_floor':
              // Client-side: exclude listings WITH "Ground floor"
              clientFilters.push((l) =>
                !l.amenities?.some((a) => a.toLowerCase() === 'ground floor')
              );
              break;
            case 'bills_not_included':
              // Client-side: exclude listings where bills NOT included
              clientFilters.push((l) => l.bills_included === true);
              break;
            default:
              break;
          }
        }
        if (requiredAmenities.length > 0) {
          params.set('exclude_amenities', requiredAmenities.join(','));
        }
      }

      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);

      const res = await fetch(`/api/listings?${params.toString()}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      // Apply client-side dealbreaker filters
      let results = data.listings || [];
      for (const filter of clientFilters) {
        results = results.filter(filter);
      }
      setListings(results);
    } catch {
      setError(true);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams, sortBy, sortOrder, faculty]);

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-navy tracking-tight">
            Available listings
          </h1>
          {!loading && (
            <p className="uppercase tracking-wider text-xs text-gray-dark/50 mt-1.5 font-heading">
              {listings.length} {listings.length === 1 ? 'result' : 'results'} found
            </p>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-gray-dark/50 mr-1">Sort by:</span>
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortBy === opt.value;
            const needsFaculty =
              (opt.value === 'walk_minutes' || opt.value === 'transit_minutes') && !faculty;
            return (
              <button
                key={opt.value}
                onClick={() => !needsFaculty && handleSort(opt.value)}
                disabled={needsFaculty}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-navy text-white'
                    : needsFaculty
                      ? 'text-gray-dark/40 cursor-not-allowed'
                      : 'text-gray-dark/70 hover:bg-gray-light'
                }`}
                title={needsFaculty ? 'Select a faculty first' : ''}
              >
                {opt.label}
                {isActive && (
                  <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
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
          <h2 className="font-heading text-xl font-semibold text-navy mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-dark/60 mb-6">
            Please try again.
          </p>
          <button
            onClick={fetchListings}
            className="inline-block bg-gold text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-gold/90 transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {/* Results grid */}
      {!loading && !error && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {listings.map((listing) => (
            <ListingCard
              key={listing.listing_id}
              listing={listing}
              faculty={faculty}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && listings.length === 0 && (
        <div className="text-center py-20">
          <svg className="w-16 h-16 mx-auto text-gray-dark/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h2 className="font-heading text-xl font-semibold text-navy mb-2">
            No listings match your criteria
          </h2>
          <p className="text-gray-dark/60 mb-6">
            Try adjusting your filters to see more results.
          </p>
          <Link
            href="/"
            className="inline-block bg-gold text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-gold/90 transition-colors"
          >
            Back to search
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
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
