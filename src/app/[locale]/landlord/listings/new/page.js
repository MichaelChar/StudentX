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

  // Import-URL state
  const [importUrl, setImportUrl] = useState('');
  const [importState, setImportState] = useState('idle'); // idle | loading | success | error
  const [importError, setImportError] = useState('');
  const [importSource, setImportSource] = useState('');
  const [initialValues, setInitialValues] = useState({});

  useEffect(() => {
    async function checkAuth() {
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
      setToken(session.access_token);
      setCheckingAuth(false);
    }
    checkAuth();
  }, [router]);

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImportState('loading');
    setImportError('');

    try {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || token;

      const res = await fetch('/api/landlord/listings/import-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ url: importUrl.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setImportState('error');
        setImportError(json.error || 'Could not import listing data.');
        return;
      }

      const imported = json.data;
      // Map external photos to external_photo_urls; leave photos empty for upload
      const { photos: externalPhotos, ...rest } = imported;
      setInitialValues({
        ...rest,
        external_photo_urls: externalPhotos || [],
      });

      try {
        setImportSource(new URL(importUrl.trim()).hostname.replace(/^www\./, ''));
      } catch {
        setImportSource('');
      }

      setImportState('success');
    } catch {
      setImportState('error');
      setImportError('Something went wrong. Please try again.');
    }
  }

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

  const inputClass =
    'flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold min-w-0';

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

      {/* Import from URL */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-dark mb-3">
          Import from spiti.gr or xe.gr
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={importUrl}
            onChange={(e) => {
              setImportUrl(e.target.value);
              if (importState !== 'idle') setImportState('idle');
              setImportError('');
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleImport(); } }}
            placeholder="https://www.spiti.gr/... or https://www.xe.gr/..."
            className={inputClass}
            disabled={importState === 'loading'}
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={importState === 'loading' || !importUrl.trim()}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy/90 transition-colors disabled:opacity-50"
          >
            {importState === 'loading' ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Importing…
              </>
            ) : (
              'Import'
            )}
          </button>
        </div>

        {importState === 'error' && (
          <p className="mt-2 text-sm text-red-600">{importError}</p>
        )}

        {importState === 'success' && (
          <p className="mt-2 text-sm text-emerald-700">
            Data imported from {importSource}. Please review all fields before submitting.
          </p>
        )}
      </div>

      {/* Imported photo thumbnails */}
      {importState === 'success' && initialValues.external_photo_urls?.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-dark/60 mb-2 uppercase tracking-wider">
            Imported photos ({initialValues.external_photo_urls.length}) — will be saved with listing
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {initialValues.external_photo_urls.slice(0, 8).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`Imported photo ${i + 1}`}
                className="aspect-[4/3] w-full rounded-lg object-cover bg-gray-light"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      )}

      <ListingForm key={JSON.stringify(initialValues)} initialValues={initialValues} onSubmit={handleSubmit} />
    </div>
  );
}
