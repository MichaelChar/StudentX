'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useAccessToken } from '@/lib/useAccessToken';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';

/*
  Propylaea landlord listings index. Shows full list of the landlord's
  listings in a compact table-style layout with edit/delete/feature actions.
*/
export default function LandlordListingsPage() {
  const t = useTranslations('landlord.dashboard');
  const router = useRouter();
  const accessToken = useAccessToken();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [togglingFeatured, setTogglingFeatured] = useState(null);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch('/api/landlord/listings', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const { listings: data } = await res.json();
          setListings(data || []);
        } else {
          setError('Failed to load listings');
        }
      } catch {
        setError('Failed to load listings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleDelete(listingId) {
    if (!confirm(t('deleteConfirm'))) return;
    setDeleting(listingId);
    try {
      if (!accessToken) {
        setDeleting(null);
        router.replace('/landlord/login');
        return;
      }
      const res = await fetch(`/api/landlord/listings/${listingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setListings((prev) => prev.filter((l) => l.listing_id !== listingId));
      } else {
        alert(t('deleteError'));
      }
    } catch (err) {
      console.error('[LandlordListings] delete failed:', err);
      alert(t('deleteError'));
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleFeatured(listingId, currentlyFeatured) {
    setTogglingFeatured(listingId);
    try {
      if (!accessToken) {
        setTogglingFeatured(null);
        router.replace('/landlord/login');
        return;
      }
      const res = await fetch(`/api/landlord/listings/${listingId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
    } catch (err) {
      console.error('[LandlordListings] toggle_featured failed:', err);
      alert(t('featuredError'));
    } finally {
      setTogglingFeatured(null);
    }
  }

  return (
    <LandlordShell
      eyebrow="Portfolio"
      title={t('title')}
      actions={
        <Button href="/landlord/listings/new" variant="gold" size="sm">
          + {t('addListing')}
        </Button>
      }
    >
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-parchment rounded-sm animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <Card tone="parchment" className="p-12 text-center">
          <Icon name="book" className="w-12 h-12 mx-auto text-night/30 mb-3" />
          <p className="font-display text-xl text-night/70 mb-5">
            {t('noListings')}
          </p>
          <Button href="/landlord/listings/new" variant="primary">
            {t('addFirst')}
          </Button>
        </Card>
      ) : (
        <Card tone="white" className="overflow-hidden">
          <ul className="divide-y divide-night/10">
            {listings.map((listing) => (
              <li key={listing.listing_id}>
                <ListingRow
                  listing={listing}
                  deleting={deleting === listing.listing_id}
                  toggling={togglingFeatured === listing.listing_id}
                  onDelete={() => handleDelete(listing.listing_id)}
                  onToggleFeatured={() =>
                    handleToggleFeatured(
                      listing.listing_id,
                      listing.is_featured
                    )
                  }
                  t={t}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </LandlordShell>
  );
}

function ListingRow({ listing, deleting, toggling, onDelete, onToggleFeatured, t }) {
  const photo = listing.photos?.find((url) => typeof url === 'string' && url.startsWith('http'));
  const address = listing.location?.address || t('noAddress');
  const heading = listing.title || address;
  const neighborhood = listing.location?.neighborhood;
  const price = listing.rent?.monthly_price;
  // Only show the address as a sublabel when the heading isn't already the
  // address (i.e. the landlord has set a distinct title).
  const showAddressBelow = listing.title && listing.title !== address;

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-4 p-5">
      <div className="relative w-full md:w-20 aspect-[4/3] md:aspect-square rounded-sm bg-parchment overflow-hidden shrink-0">
        {photo ? (
          <Image
            src={photo}
            alt={address}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-night/20">
            <Icon name="photo" className="w-6 h-6" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <p className="font-display text-xl text-night truncate">
            {heading}
          </p>
          {listing.is_featured && <Pill variant="verified">Featured</Pill>}
        </div>
        {showAddressBelow && (
          <p className="text-xs text-night/50 mb-1 truncate">{address}</p>
        )}
        <p className="label-caps text-night/50">
          {neighborhood}
          {listing.property_types?.name && (
            <> · {listing.property_types.name}</>
          )}
          {price != null && <> · €{price}/mo</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          onClick={onToggleFeatured}
          disabled={toggling}
          className={`label-caps px-3 py-1.5 rounded-sm border transition-colors disabled:opacity-50 ${
            listing.is_featured
              ? 'border-gold text-gold hover:bg-gold hover:text-white'
              : 'border-night/20 text-night/60 hover:border-gold hover:text-gold'
          }`}
        >
          {toggling ? '…' : listing.is_featured ? t('featured') : t('unfeatured')}
        </button>
        <Link
          href={`/listing/${listing.listing_id}`}
          target="_blank"
          className="label-caps px-3 py-1.5 rounded-sm border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors"
        >
          {t('view')}
        </Link>
        <Link
          href={`/landlord/listings/${listing.listing_id}/edit`}
          className="label-caps px-3 py-1.5 rounded-sm border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors"
        >
          {t('edit')}
        </Link>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="label-caps px-3 py-1.5 rounded-sm border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {deleting ? t('deleting') : t('delete')}
        </button>
      </div>
    </div>
  );
}
