'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAccessToken } from '@/lib/useAccessToken';
import ListingForm from '@/components/ListingForm';
import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/*
  Propylaea new listing page — wraps existing ListingForm in the landlord
  shell. Auth is handled by LandlordShell.
*/
export default function NewListingPage() {
  const t = useTranslations('landlord.newListing');
  const router = useRouter();
  const accessToken = useAccessToken();

  const [importUrl, setImportUrl] = useState('');
  const [importState, setImportState] = useState('idle');
  const [importError, setImportError] = useState('');
  const [importSource, setImportSource] = useState('');
  const [initialValues, setInitialValues] = useState({});

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImportState('loading');
    setImportError('');

    try {
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
    } catch (err) {
      console.error('[NewListing] import_url failed:', err);
      setImportState('error');
      setImportError('Something went wrong. Please try again.');
    }
  }

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

    router.push('/property/landlord/dashboard');
  }

  return (
    <LandlordShell eyebrow="Portfolio" title={t('title')}>
      <div className="max-w-3xl">
        {/* Import from URL */}
        <Card tone="parchment" border={false} className="p-5 mb-8">
          <p className="label-caps text-night/70 mb-3">
            Import from spiti.gr or xe.gr
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => {
                setImportUrl(e.target.value);
                if (importState !== 'idle') setImportState('idle');
                setImportError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleImport();
                }
              }}
              placeholder="https://www.spiti.gr/... or https://www.xe.gr/..."
              className="flex-1 border border-night/15 bg-white rounded-sm px-4 py-2.5 text-sm focus:outline-none focus:border-blue"
              disabled={importState === 'loading'}
            />
            <Button
              onClick={handleImport}
              disabled={importState === 'loading' || !importUrl.trim()}
              variant="primary"
              size="sm"
            >
              {importState === 'loading' ? 'Importing…' : 'Import'}
            </Button>
          </div>

          {importState === 'error' && (
            <p className="mt-2 text-sm text-red-600">{importError}</p>
          )}

          {importState === 'success' && (
            <p className="mt-2 text-sm text-emerald-700">
              Data imported from {importSource}. Please review all fields before submitting.
            </p>
          )}
        </Card>

        {/* Imported photos */}
        {importState === 'success' && initialValues.external_photo_urls?.length > 0 && (
          <div className="mb-8">
            <p className="label-caps text-night/50 mb-2">
              Imported photos ({initialValues.external_photo_urls.length}) — will be saved with listing
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {initialValues.external_photo_urls.slice(0, 8).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`Imported photo ${i + 1}`}
                  className="aspect-[4/3] w-full rounded-sm object-cover bg-parchment"
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        )}

        <ListingForm
          key={JSON.stringify(initialValues)}
          initialValues={initialValues}
          onSubmit={handleSubmit}
        />
      </div>
    </LandlordShell>
  );
}
