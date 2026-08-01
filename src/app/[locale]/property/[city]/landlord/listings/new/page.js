'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAccessToken } from '@/lib/useAccessToken';
import ListingForm from '@/components/ListingForm';
import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';

/*
  New listing — multi-step wizard. Draft-saves via POST then PATCH as the
  landlord advances; final submit flags the listing live.
*/
export default function NewListingPage() {
  const t = useTranslations('landlord.newListing');
  const tWiz = useTranslations('landlord.listingWizard');
  const router = useRouter();
  const accessToken = useAccessToken();
  const [draftId, setDraftId] = useState(null);

  async function saveDraft(payload) {
    if (draftId) {
      const res = await fetch(`/api/landlord/listings/${draftId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || t('failedToCreate'));
      }
      return { listing_id: draftId };
    }

    const res = await fetch('/api/landlord/listings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || t('failedToCreate'));
    }
    const data = await res.json();
    setDraftId(data.listing_id);
    return { listing_id: data.listing_id };
  }

  async function handleSubmit(formData) {
    if (draftId) {
      const res = await fetch(`/api/landlord/listings/${draftId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ...formData, submit: true, draft: false }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || t('failedToCreate'));
      }
    } else {
      const res = await fetch('/api/landlord/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ...formData, submit: true, draft: false }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || t('failedToCreate'));
      }
    }
    router.push('/property/thessaloniki/landlord/listings');
  }

  return (
    <LandlordShell eyebrow={tWiz('eyebrow')} title={t('title')}>
      <div className="max-w-3xl">
        <ListingForm
          listingId={draftId}
          accessToken={accessToken}
          onSaveDraft={saveDraft}
          onSubmit={handleSubmit}
        />
      </div>
    </LandlordShell>
  );
}
