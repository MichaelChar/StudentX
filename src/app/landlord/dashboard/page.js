'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import BillingSection from '@/components/BillingSection';

export default function LandlordDashboardPage() {
  const router = useRouter();
  const [listings, setListings] = useState([]);
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
      await fetchListings(session.access_token);
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

  async function handleDelete(listingId) {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
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
      alert('Failed to delete listing. Please try again.');
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
      alert(data.error || 'Failed to update featured status.');
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
        <h1 className="font-heading text-2xl font-bold text-navy">My Listings</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/landlord/listings/new"
            className="bg-gold text-white font-heading font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-gold/90 transition-colors"
          >
            + Add listing
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-dark/60 hover:text-navy transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Billing & Subscription */}
      <div className="mb-8">
        <h2 className="font-heading text-lg font-bold text-navy mb-4">Billing & Subscription</h2>
        <BillingSection />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {listings.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-dark/50 mb-4">You have no listings yet.</p>
          <Link
            href="/landlord/listings/new"
            className="inline-block bg-navy text-white font-heading font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-navy/90 transition-colors"
          >
            Add your first listing
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
                    {listing.location?.address || 'No address'}
                  </span>
                  <span className="text-xs text-gray-dark/40 shrink-0">#{listing.listing_id}</span>
                  {listing.is_featured && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gold/10 text-gold shrink-0">
                      Featured
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-dark/60">
                  <span>{listing.property_types?.name || '—'}</span>
                  <span>{listing.location?.neighborhood || '—'}</span>
                  <span>
                    {listing.rent?.monthly_price != null
                      ? `€${listing.rent.monthly_price}/mo`
                      : 'Price on request'}
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
                  {togglingFeatured === listing.listing_id ? '...' : listing.is_featured ? 'Unfeature' : 'Feature'}
                </button>
                <Link
                  href={`/listing/${listing.listing_id}`}
                  target="_blank"
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-dark/70 hover:border-navy hover:text-navy transition-colors"
                >
                  View
                </Link>
                <Link
                  href={`/landlord/listings/${listing.listing_id}/edit`}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-dark/70 hover:border-navy hover:text-navy transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(listing.listing_id)}
                  disabled={deleting === listing.listing_id}
                  className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deleting === listing.listing_id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
