'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import ListingForm from '@/components/ListingForm';
import { useTranslations } from 'next-intl';

export default function NewListingPage() {
  const t = useTranslations('landlord.newListing');
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/landlord/login');
        return;
      }
      setToken(session.access_token);
      setCheckingAuth(false);
    }
    checkAuth();
  }, [router]);

  async function handleSubmit(formData) {
    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token || token;

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

    router.push('/landlord/dashboard');
  }

  if (checkingAuth) {
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
          {t('backToDashboard')}
        </Link>
        <h1 className="font-heading text-2xl font-bold text-navy">{t('title')}</h1>
      </div>

      <ListingForm onSubmit={handleSubmit} />
    </div>
  );
}
