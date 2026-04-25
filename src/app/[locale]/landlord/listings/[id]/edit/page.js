'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import ListingForm from '@/components/ListingForm';
import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';

export default function EditListingPage() {
  const t = useTranslations('landlord.editListing');
  const router = useRouter();
  const { id } = useParams();
  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/landlord/listings/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setError(t('notFoundError'));
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
        photos: listing.photos || [],
      });
      setLoading(false);
    })();
  }, [id, t]);

  async function handleSubmit(formData) {
    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();

    const payload = {
      ...formData,
      monthly_price: formData.monthly_price !== '' ? parseFloat(formData.monthly_price) : null,
      deposit: formData.deposit !== '' ? parseFloat(formData.deposit) : 0,
      sqm: formData.sqm !== '' ? parseInt(formData.sqm, 10) : null,
      floor: formData.floor !== '' ? parseInt(formData.floor, 10) : null,
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
      throw new Error(e || t('failedToUpdate'));
    }

    router.push('/landlord/dashboard');
  }

  return (
    <LandlordShell eyebrow={`Listing #${id}`} title={t('title')}>
      <div className="max-w-3xl">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-40 bg-parchment rounded-sm" />
            <div className="h-40 bg-parchment rounded-sm" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <Button href="/landlord/dashboard" variant="ghost">
              ← {t('backToDashboard')}
            </Button>
          </div>
        ) : (
          initialValues && (
            <ListingForm
              initialValues={initialValues}
              onSubmit={handleSubmit}
            />
          )
        )}
      </div>
    </LandlordShell>
  );
}
