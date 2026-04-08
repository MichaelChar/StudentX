'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import BillingSection from '@/components/BillingSection';
import { useTranslations } from 'next-intl';

export default function LandlordDashboardPage() {
  const t = useTranslations('landlord.dashboard');
  const router = useRouter();
  const [listings, setListings] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [togglingFeatured, setTogglingFeatured] = useState(null);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/landlord/login');
        return;
      }
      if (!session.user.email_confirmed_at) {
        router.replace('/landlord/verify-email');
        return;
      }
      await Promise.all([
        fetchListings(session.access_token),
        fetchAnalytics(session.access_token),
      ]);
    }
    init();
  }, [router]);

  async function fetchListings(token) {
    setLoading(true);
    try {
      const res = await fetch('/api/landlord/listings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const { error: e } = await res.json();
        setError(e || 'Failed to load listings');
        return;
      }
      const { listings: data } = await res.json();
      setListings(data || []);
    } catch {
      setError('Failed to load listings');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAnalytics(token) {
    try {
      const res = await fetch('/api/landlord/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { analytics: data } = await res.json();
        setAnalytics(data);
      }
    } catch {
      // analytics are non-critical
    }
  }

  async function handleDelete(listingId) {
    if (!confirm(t('deleteConfirm'))) return;
    setDeleting(listingId);

    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/landlord/login'); return; }

    const res = await fetch(`/api/landlord/listings/${listingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      setListings((prev) => prev.filter((l) => l.listing_id !== listingId));
    } else {
      alert(t('deleteError'));
    }
    setDeleting(null);
  }

  async function handleToggleFeatured(listingId, currentlyFeatured) {
    setTogglingFeatured(listingId);

    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/landlord/login'); return; }

    const res = await fetch(`/api/landlord/listings/${listingId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_featured: !currentlyFeatured }),
    });

    if (res.ok) {
      setListings((prev) =>
        prev.map((l) =>
          l.listing_id === listingId ? { ...l, is_featured: !currentlyFeatured } : l
        )
      );
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || t('featuredError'));
    }
    setTogglingFeatured(null);
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/landlord/login');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-light rounded" />
          <div className="h-32 bg-gray-light rounded-xl" />
          <div className="h-32 bg-gray-light rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-2xl font-bold text-navy">{t('title')}</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/landlord/listings/new"
            className="bg-gold text-white font-heading font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-gold/90 transition-colors"
          >
            + {t('addListing')}
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-dark/60 hover:text-navy transition-colors"
          >
            {t('logout')}
          </button>
        </div>
      </div>

      {/* Billing & Subscription */}
      <div className="mb-8">
        <h2 className="font-heading text-lg font-bold text-navy mb-4">{t('billingTitle')}</h2>
        <BillingSection />
      </div>

      {/* Analytics Overview */}
      {analytics && (listings.length > 0 || analytics.total_views > 0) && (
        <div className="mb-8">
          <h2 className="font-heading text-lg font-bold text-navy mb-4">{t('analyticsTitle')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <StatCard label={t('views30d')} value={analytics.views_last_30_days} />
            <StatCard label={t('inquiries30d')} value={analytics.inquiries_last_30_days} />
            <StatCard label={t('totalViews')} value={analytics.total_views} />
            <StatCard label={t('conversion')} value={`${analytics.conversion_rate}%`} />
          </div>
          {analytics.per_listing.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-light text-gray-dark/60 text-xs">
                    <th className="text-left px-4 py-2 font-medium">{t('listingColumn')}</th>
                    <th className="text-right px-4 py-2 font-medium">{t('views')}</th>
                    <th className="text-right px-4 py-2 font-medium">{t('inquiries')}</th>
                    <th className="text-right px-4 py-2 font-medium">{t('conversionRate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analytics.per_listing.map((pl) => {
                    const listing = listings.find((l) => l.listing_id === pl.listing_id);
                    return (
                      <tr key={pl.listing_id}>
                        <td className="px-4 py-2.5 truncate max-w-[200px]">
                          {listing?.location?.address || `#${pl.listing_id}`}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-dark/70">{pl.views}</td>
                        <td className="px-4 py-2.5 text-right text-gray-dark/70">{pl.inquiries}</td>
                        <td className="px-4 py-2.5 text-right text-gray-dark/70">{Math.round(pl.conversion * 10) / 10}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {listings.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-dark/50 mb-4">{t('noListings')}</p>
          <Link
            href="/landlord/listings/new"
            className="inline-block bg-navy text-white font-heading font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-navy/90 transition-colors"
          >
            {t('addFirst')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => (
            <div
              key={listing.listing_id}
              className="border border-gray-200 rounded-xl p-5 bg-white flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-heading font-semibold text-navy text-base truncate">
                    {listing.location?.address || t('noAddress')}
                  </span>
                  <span className="text-xs text-gray-dark/40 shrink-0">#{listing.listing_id}</span>
                  {listing.is_featured && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gold/10 text-gold shrink-0">
                      {t('featured')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-dark/60">
                  <span>{listing.property_types?.name || '—'}</span>
                  <span>{listing.location?.neighborhood || '—'}</span>
                  <span>
                    {listing.rent?.monthly_price != null
                      ? `€${listing.rent.monthly_price}/mo`
                      : t('priceOnRequest')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggleFeatured(listing.listing_id, listing.is_featured)}
                  disabled={togglingFeatured === listing.listing_id}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    listing.is_featured
                      ? 'border-gold/40 text-gold hover:bg-gold/5'
                      : 'border-gray-200 text-gray-dark/70 hover:border-gold hover:text-gold'
                  }`}
                >
                  {togglingFeatured === listing.listing_id ? '...' : listing.is_featured ? t('featured') : t('unfeatured')}
                </button>
                <Link
                  href={`/listing/${listing.listing_id}`}
                  target="_blank"
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-dark/70 hover:border-navy hover:text-navy transition-colors"
                >
                  {t('view')}
                </Link>
                <Link
                  href={`/landlord/listings/${listing.listing_id}/edit`}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-dark/70 hover:border-navy hover:text-navy transition-colors"
                >
                  {t('edit')}
                </Link>
                <button
                  onClick={() => handleDelete(listing.listing_id)}
                  disabled={deleting === listing.listing_id}
                  className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deleting === listing.listing_id ? t('deleting') : t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-gray-light rounded-xl p-4">
      <p className="text-xs text-gray-dark/50 mb-1">{label}</p>
      <p className="font-heading text-xl font-bold text-navy">{value}</p>
    </div>
  );
}
