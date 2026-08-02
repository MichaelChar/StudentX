'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useAccessToken } from '@/lib/useAccessToken';
import ListingForm from '@/components/ListingForm';
import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';

export default function EditListingPage() {
  const t = useTranslations('landlord.editListing');
  const tWiz = useTranslations('landlord.listingWizard');
  const router = useRouter();
  const accessToken = useAccessToken();
  const { id } = useParams();
  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const [listingRes, verRes] = await Promise.all([
        fetch(`/api/landlord/listings/${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/landlord/verification', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      if (verRes.ok) {
        const v = await verRes.json();
        setIsVerified(v.isVerified === true);
      }

      if (!listingRes.ok) {
        setError(t('notFoundError'));
        setLoading(false);
        return;
      }

      const { listing, blackouts } = await listingRes.json();

      setInitialValues({
        title: listing.title || '',
        address: listing.location?.address || '',
        neighborhood: listing.location?.neighborhood || '',
        lat: listing.location?.lat ?? '',
        lng: listing.location?.lng ?? '',
        property_type: listing.property_types?.name || '',
        monthly_price: listing.rent?.monthly_price ?? '',
        bills_included: listing.rent?.bills_included || false,
        deposit: listing.rent?.deposit ?? '',
        agency_fee: listing.agency_fee ?? '',
        description: listing.description || '',
        sqm: listing.sqm ?? '',
        floor: listing.floor ?? '',
        bedrooms: listing.bedrooms ?? '',
        bathrooms: listing.bathrooms ?? '',
        smoking_allowed: listing.smoking_allowed === true,
        pets_allowed: listing.pets_allowed === true,
        additional_rules: listing.additional_rules || '',
        available_from: listing.available_from || '',
        available_to: listing.available_to || '',
        min_duration_months: String(listing.min_duration_months ?? 9),
        max_duration_months:
          listing.max_duration_months != null
            ? String(listing.max_duration_months)
            : '',
        video_url: listing.video_url || '',
        amenity_ids:
          listing.listing_amenities?.map((la) => la.amenities.amenity_id) ||
          [],
        university_distances:
          listing.listing_university_distances?.map((ud) => ({
            university_id: ud.university_id,
            distance_meters: String(ud.distance_meters),
            source: ud.source === 'computed' ? 'computed' : 'landlord',
          })) || [],
        photos: listing.photos || [],
        external_photo_urls: listing.external_photo_urls || [],
        blackouts: (blackouts || []).map((b) => ({
          start_date: b.start_date,
          end_date: b.end_date,
        })),
        flags: listing.flags || {},
      });
      setLoading(false);
    })();
  }, [id, t]);

  async function handleSaveDraft(formData) {
    const res = await fetch(`/api/landlord/listings/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ...formData, draft: true }),
    });
    if (!res.ok) {
      const { error: e } = await res.json().catch(() => ({}));
      throw new Error(e || t('failedToUpdate'));
    }
    return { listing_id: id };
  }

  async function handleSubmit(formData) {
    const res = await fetch(`/api/landlord/listings/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ...formData, submit: true, draft: false }),
    });

    if (!res.ok) {
      const { error: e } = await res.json().catch(() => ({}));
      throw new Error(e || t('failedToUpdate'));
    }

    router.push('/property/thessaloniki/landlord/listings');
  }

  return (
    <LandlordShell eyebrow={tWiz('eyebrow')} title={t('title')}>
      <div className="max-w-3xl">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-40 bg-parchment rounded-sm" />
            <div className="h-40 bg-parchment rounded-sm" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-700 mb-4">{error}</p>
            <Button href="/property/thessaloniki/landlord/listings" variant="ghost">
              ← {t('backToDashboard')}
            </Button>
          </div>
        ) : (
          initialValues && (
            <ListingForm
              initialValues={initialValues}
              listingId={id}
              isVerified={isVerified}
              accessToken={accessToken}
              onSaveDraft={handleSaveDraft}
              onSubmit={handleSubmit}
            />
          )
        )}
      </div>
    </LandlordShell>
  );
}
