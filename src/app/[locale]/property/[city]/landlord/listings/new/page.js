'use client';

import { useRouter } from '@/i18n/navigation';
import { useAccessToken } from '@/lib/useAccessToken';
import ListingForm from '@/components/ListingForm';
import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';

/*
  Propylaea new listing page — wraps existing ListingForm in the landlord
  shell. Auth is handled by LandlordShell.
*/
export default function NewListingPage() {
  const t = useTranslations('landlord.newListing');
  const router = useRouter();
  const accessToken = useAccessToken();

  async function handleSubmit(formData) {
    const payload = {
      ...formData,
      monthly_price: formData.monthly_price ? parseFloat(formData.monthly_price) : null,
      deposit: formData.deposit ? parseFloat(formData.deposit) : 0,
      sqm: formData.sqm ? parseInt(formData.sqm, 10) : null,
      floor: formData.floor !== '' ? parseInt(formData.floor, 10) : null,
    };

    const res = await fetch('/api/landlord/listings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || t('failedToCreate'));
    }

    router.push('/property/thessaloniki/landlord/dashboard');
  }

  return (
    <LandlordShell eyebrow="Portfolio" title={t('title')}>
      <div className="max-w-3xl">
        <ListingForm onSubmit={handleSubmit} />
      </div>
    </LandlordShell>
  );
}
