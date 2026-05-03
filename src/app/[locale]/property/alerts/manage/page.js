'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

function FilterSummary({ filters }) {
  const parts = [];
  if (filters.minBudget || filters.maxBudget) {
    const min = filters.minBudget ? `€${filters.minBudget}` : '';
    const max = filters.maxBudget ? `€${filters.maxBudget}` : '';
    if (min && max) parts.push(`${min}–${max}/mo`);
    else if (min) parts.push(`From ${min}/mo`);
    else parts.push(`Up to ${max}/mo`);
  }
  if (filters.types?.length > 0) parts.push(filters.types.join(', '));
  if (filters.neighborhoods?.length > 0) parts.push(filters.neighborhoods.join(', '));
  if (filters.amenities?.length > 0) parts.push(filters.amenities.join(', '));
  if (filters.faculty) parts.push(`Faculty: ${filters.faculty}`);

  if (parts.length === 0) return <span className="text-gray-dark/50 italic">All listings</span>;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-block text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-light text-gray-dark/70">
          {p}
        </span>
      ))}
    </div>
  );
}

function ManageContent() {
  const t = useTranslations('alerts');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);

  // Fetch-on-mount + token-presence gate. The setState calls inside
  // this effect are intentional (the React docs accept this pattern
  // for fetching from a server). Refactor to SWR/TanStack Query is a
  // larger effort tracked separately.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    fetch(`/api/saved-searches/manage?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) throw new Error('API error');
        return r.json();
      })
      .then((data) => {
        if (data) setAlert(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleUnsubscribe() {
    if (!token || unsubscribing) return;
    setUnsubscribing(true);
    try {
      const res = await fetch(`/api/saved-searches/manage?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setUnsubscribed(true);
        setAlert((prev) => prev ? { ...prev, is_active: false } : prev);
      }
    } catch {
      // ignore
    } finally {
      setUnsubscribing(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="h-6 w-48 bg-gray-light rounded animate-pulse mx-auto mb-4" />
        <div className="h-4 w-32 bg-gray-light rounded animate-pulse mx-auto" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-bold text-navy mb-3">{t('notFound')}</h1>
        <p className="text-gray-dark/60 mb-6">{t('notFoundDesc')}</p>
        <Link href="/property/results" className="inline-block bg-gold text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-gold/90 transition-colors">
          {t('browseListings')}
        </Link>
      </div>
    );
  }

  if (unsubscribed || (alert && !alert.is_active)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-heading text-2xl font-bold text-navy mb-3">{t('unsubscribed')}</h1>
        <p className="text-gray-dark/60 mb-6">{t('unsubscribedDesc')}</p>
        <Link href="/property/results" className="inline-block bg-navy text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-navy/90 transition-colors">
          {t('browseListings')}
        </Link>
      </div>
    );
  }

  const createdDate = alert?.created_at
    ? new Date(alert.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="font-heading text-2xl md:text-3xl font-bold text-navy mb-2">{t('title')}</h1>
      <p className="text-gray-dark/60 mb-8">{t('desc')}</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Label */}
        <div>
          <p className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/40 mb-1">{t('alertName')}</p>
          <p className="text-navy font-medium">{alert?.label || t('unnamedAlert')}</p>
        </div>

        {/* Frequency */}
        <div>
          <p className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/40 mb-1">{t('frequency')}</p>
          <p className="text-navy font-medium capitalize">{alert?.frequency || 'daily'}</p>
        </div>

        {/* Filters */}
        <div>
          <p className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/40 mb-1">{t('filters')}</p>
          <FilterSummary filters={alert?.filters || {}} />
        </div>

        {/* Created */}
        {createdDate && (
          <div>
            <p className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/40 mb-1">{t('createdOn')}</p>
            <p className="text-gray-dark/60 text-sm">{createdDate}</p>
          </div>
        )}

        {/* Unsubscribe */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleUnsubscribe}
            disabled={unsubscribing}
            className="w-full py-2.5 rounded-lg border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            {unsubscribing ? t('unsubscribing') : t('unsubscribe')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManageAlertsPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="h-6 w-48 bg-gray-light rounded animate-pulse mx-auto" />
      </div>
    }>
      <ManageContent />
    </Suspense>
  );
}
