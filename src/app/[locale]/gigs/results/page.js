'use client';

/*
  Holiday Gigs board — sibling of the property results page, trimmed per spec:
    - no max-price slider, no sort control, no type/superlandlord filters
    - Paid / Unpaid toggle (2 buttons), auto-selected from the ?pay= param
    - neighbourhood filter replaced by a data-driven Country filter
    - availability (start date) + minimum length filters kept
    - pay histogram shown for Paid only
    - List | Map toggle (map browses gigs by country)
*/

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import GigCard from '@/components/GigCard';
import { buildPriceHistogram, maxBucketCount } from '@/lib/priceHistogram';

const GigsMap = dynamic(() => import('@/components/GigsMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-sm border border-night/10 bg-parchment animate-pulse" />
  ),
});

const DURATION_OPTIONS = [2, 4, 8, 12];

function GigsResultsInner() {
  const t = useTranslations('gigs.results');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pay, setPay] = useState(() => (searchParams.get('pay') === 'unpaid' ? 'unpaid' : 'paid'));
  const [selectedCountries, setSelectedCountries] = useState(() => {
    const c = searchParams.get('countries');
    return c ? c.split(',').filter(Boolean) : [];
  });
  const [availableFrom, setAvailableFrom] = useState(() => searchParams.get('available_from') || '');
  const [minDuration, setMinDuration] = useState(() => {
    const d = searchParams.get('min_duration');
    return d ? Number(d) : 0;
  });
  const [viewMode, setViewMode] = useState('list');

  const [countryOptions, setCountryOptions] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Country filter options — data-driven, so a newly-seeded country appears
  // automatically.
  useEffect(() => {
    fetch('/api/gigs/countries')
      .then((r) => r.json())
      .then((d) => setCountryOptions(d.countries || []))
      .catch(() => setCountryOptions([]));
  }, []);

  // Shared query string for the non-pay filters (used by both the board fetch
  // and the histogram fetch).
  const sharedParams = useMemo(() => {
    const p = new URLSearchParams();
    if (selectedCountries.length) p.set('countries', selectedCountries.join(','));
    if (availableFrom) p.set('available_from', availableFrom);
    if (minDuration) p.set('min_duration', String(minDuration));
    return p;
  }, [selectedCountries, availableFrom, minDuration]);

  // Fetch the board whenever pay or any non-pay filter changes. State updates
  // live inside an async IIFE (not the effect body) to satisfy the project's
  // react-hooks/set-state-in-effect rule.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const p = new URLSearchParams(sharedParams);
      p.set('pay', pay);
      try {
        const d = await fetch(`/api/gigs?${p.toString()}`).then((r) => r.json());
        if (!cancelled) setGigs(d.gigs || []);
      } catch {
        if (!cancelled) setGigs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pay, sharedParams]);

  // Pay histogram is paid-only — only fetch when Paid is active. The histogram
  // render is also gated on `pay === 'paid'`, so stale prices left over from a
  // previous Paid view are never shown (no clearing setState needed).
  useEffect(() => {
    if (pay !== 'paid') return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetch(`/api/gigs/prices?${sharedParams.toString()}`).then((r) => r.json());
        if (!cancelled) setPrices(d.prices || []);
      } catch {
        if (!cancelled) setPrices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pay, sharedParams]);

  // Mirror filter state into the URL for share/back/refresh.
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('pay', pay);
    if (selectedCountries.length) p.set('countries', selectedCountries.join(','));
    if (availableFrom) p.set('available_from', availableFrom);
    if (minDuration) p.set('min_duration', String(minDuration));
    router.replace(`/gigs/results?${p.toString()}`, { scroll: false });
  }, [pay, selectedCountries, availableFrom, minDuration, router]);

  const histogram = useMemo(() => {
    if (!prices.length) return [];
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const min = Math.max(0, Math.floor(lo / 100) * 100);
    const max = Math.max(min + 100, Math.ceil(hi / 100) * 100);
    return buildPriceHistogram(
      prices.map((p) => ({ monthly_price: p })),
      { min, max, buckets: 10 }
    );
  }, [prices]);
  const histPeak = maxBucketCount(histogram);

  const toggleCountry = (code) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const clearFilters = () => {
    setSelectedCountries([]);
    setAvailableFrom('');
    setMinDuration(0);
  };

  const fromQuery = searchParams.toString();

  return (
    <div className="min-h-screen bg-stone">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="font-display text-3xl text-night">{t('title')}</h1>
          <Link href="/gigs" className="text-sm text-blue hover:underline">
            ← {t('backToChoice')}
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Filters */}
          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <div>
              <p className="label-caps mb-2 text-night/50">{t('payType')}</p>
              <div className="grid grid-cols-2 gap-2">
                {['paid', 'unpaid'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPay(opt)}
                    className={`rounded-sm border px-3 py-2 text-sm font-medium transition-colors ${
                      pay === opt
                        ? 'border-blue bg-blue text-white'
                        : 'border-night/15 bg-white text-night/70 hover:border-blue/40'
                    }`}
                  >
                    {t(opt)}
                  </button>
                ))}
              </div>
            </div>

            {/* Pay histogram — paid only */}
            {pay === 'paid' && histogram.length > 0 && histPeak > 0 && (
              <div>
                <p className="label-caps mb-1 text-night/50">{t('payDistribution')}</p>
                <p className="mb-2 text-xs text-night/40">{t('payDistributionHint')}</p>
                <div className="flex h-20 items-end gap-1">
                  {histogram.map((b, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-blue/30"
                      style={{ height: `${Math.max(4, (b.count / histPeak) * 100)}%` }}
                      title={`€${Math.round(b.from)}–${Math.round(b.to)}: ${b.count}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="label-caps mb-2 text-night/50">{t('country')}</p>
              <div className="flex flex-wrap gap-2">
                {countryOptions.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCountry(c.code)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selectedCountries.includes(c.code)
                        ? 'border-blue bg-blue/10 text-blue'
                        : 'border-night/15 bg-white text-night/70 hover:border-blue/40'
                    }`}
                  >
                    {c.flag} {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label-caps mb-2 block text-night/50" htmlFor="available_from">
                {t('availability')}
              </label>
              <input
                id="available_from"
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="w-full rounded-sm border border-night/15 bg-white px-3 py-2 text-sm text-night"
              />
            </div>

            <div>
              <label className="label-caps mb-2 block text-night/50" htmlFor="min_duration">
                {t('duration')}
              </label>
              <select
                id="min_duration"
                value={minDuration}
                onChange={(e) => setMinDuration(Number(e.target.value))}
                className="w-full rounded-sm border border-night/15 bg-white px-3 py-2 text-sm text-night"
              >
                <option value={0}>{t('anyDuration')}</option>
                {DURATION_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {t('weeksPlus', { weeks: w })}
                  </option>
                ))}
              </select>
            </div>

            {(selectedCountries.length > 0 || availableFrom || minDuration > 0) && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-blue hover:underline"
              >
                {t('clearFilters')}
              </button>
            )}
          </aside>

          {/* Results */}
          <main>
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-night/60">
                {loading ? t('loading') : t('resultCount', { count: gigs.length })}
              </p>
              <div className="inline-flex rounded-sm border border-night/15 bg-white p-0.5">
                {['list', 'map'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                      viewMode === mode ? 'bg-blue text-white' : 'text-night/60 hover:text-night'
                    }`}
                  >
                    {t(mode)}
                  </button>
                ))}
              </div>
            </div>

            {viewMode === 'map' ? (
              <div className="h-[70vh]">
                <GigsMap gigs={gigs} selectedCountries={selectedCountries} />
              </div>
            ) : loading ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[4/5] animate-pulse rounded-sm border border-night/10 bg-parchment"
                  />
                ))}
              </div>
            ) : gigs.length === 0 ? (
              <div className="rounded-sm border border-night/10 bg-white p-10 text-center">
                <p className="font-display text-xl text-night">{t('noResults')}</p>
                <p className="mt-1 text-sm text-night/50">{t('noResultsHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {gigs.map((gig) => (
                  <GigCard key={gig.gig_id} gig={gig} fromQuery={fromQuery} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function GigsResultsPage() {
  return (
    <Suspense fallback={null}>
      <GigsResultsInner />
    </Suspense>
  );
}
