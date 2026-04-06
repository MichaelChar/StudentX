'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import ListingForm from '@/components/ListingForm';

export default function EditListingPage() {
  const router = useRouter();
  const { id } = useParams();
  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/landlord/login');
        return;
      }

      const res = await fetch(`/api/landlord/listings/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setError('Listing not found or you do not have permission to edit it.');
        setLoading(false);
        return;
      }

      const { listing } = await res.json();

      setInitialValues({
        address: listing.location?.address || '',
        neighborhood: listing.location?.neighborhood || '',
        lat: listing.location?.lat ?? '',
        lng: listing.location?.lng ?? '',
        property_type: listing.property_types?.name || '',
        monthly_price: listing.rent?.monthly_price ?? '',
        bills_included: listing.rent?.bills_included || false,
        deposit: listing.rent?.deposit ?? '',
        description: listing.description || '',
        sqm: listing.sqm ?? '',
        floor: listing.floor ?? '',
        available_from: listing.available_from || '',
        rental_duration: listing.rental_duration || '',
        amenity_ids: listing.listing_amenities?.map((la) => la.amenities.amenity_id) || [],
      });
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSubmit(formData) {
    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();

    const payload = {
      ...formData,
      monthly_price: formData.monthly_price !== '' ? parseFloat(formData.monthly_price) : null,
      deposit: formData.deposit !== '' ? parseFloat(formData.deposit) : 0,
      sqm: formData.sqm !== '' ? parseInt(formData.sqm, 10) : null,
    };

    const res = await fetch(`/api/landlord/listings/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { error: e } = await res.json();
      throw new Error(e || 'Failed to update listing');
    }

    router.push('/landlord/dashboard');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 animate-pulse">
        <div className="h-8 w-48 bg-gray-light rounded mb-8" />
        <div className="space-y-4">
          <div className="h-40 bg-gray-light rounded-xl" />
          <div className="h-40 bg-gray-light rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/landlord/dashboard" className="text-gold hover:underline text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <div className="mb-8">
        <Link
          href="/landlord/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-dark/60 hover:text-navy transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold text-navy">Edit listing</h1>
        <p className="text-sm text-gray-dark/50 mt-1">#{id}</p>
      </div>

      {initialValues && (
        <ListingForm
          initialValues={initialValues}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
        />
      )}
    </div>
  );
}
