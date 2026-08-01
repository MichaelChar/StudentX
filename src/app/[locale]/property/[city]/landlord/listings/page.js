'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useAccessToken } from '@/lib/useAccessToken';

import LandlordShell from '@/components/landlord/LandlordShell';
import { variantUrl } from '@/lib/photoVariants';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import Pill from '@/components/ui/Pill';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import StatusLadder, {
  deriveListingStage,
} from '@/components/listing-wizard/StatusLadder';

/*
  Propylaea landlord listings index — View · Edit · Duplicate · Disable · Delete.
*/
export default function LandlordListingsPage() {
  const t = useTranslations('landlord.dashboard');
  const tWiz = useTranslations('landlord.listingWizard');
  const router = useRouter();
  const accessToken = useAccessToken();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isVerified, setIsVerified] = useState(false);

  async function loadListings(token) {
    const res = await fetch('/api/landlord/listings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { listings: data } = await res.json();
      setListings(data || []);
    } else {
      setError(t('loadError'));
    }
  }

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      try {
        await loadListings(session.access_token);
        const verRes = await fetch('/api/landlord/verification', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (verRes.ok) {
          const v = await verRes.json();
          setIsVerified(v.isVerified === true);
        }
      } catch {
        setError(t('loadError'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function performDelete(listingId) {
    setError('');
    setBusyId(listingId);
    try {
      if (!accessToken) {
        setBusyId(null);
        setConfirmTarget(null);
        router.replace('/property/thessaloniki/landlord/login');
        return;
      }
      const res = await fetch(`/api/landlord/listings/${listingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setListings((prev) => prev.filter((l) => l.listing_id !== listingId));
      } else {
        setError(t('deleteError'));
      }
    } catch (err) {
      console.error('[LandlordListings] delete failed:', err);
      setError(t('deleteError'));
    } finally {
      setConfirmTarget(null);
      setBusyId(null);
    }
  }

  async function performDuplicate(listingId) {
    setError('');
    setBusyId(listingId);
    try {
      const res = await fetch(`/api/landlord/listings/${listingId}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t('duplicateError'));
        return;
      }
      const { listing_id: newId } = await res.json();
      router.push(`/property/thessaloniki/landlord/listings/${newId}/edit`);
    } catch (err) {
      console.error('[LandlordListings] duplicate failed:', err);
      setError(t('duplicateError'));
    } finally {
      setBusyId(null);
    }
  }

  async function performToggleDisable(listing) {
    setError('');
    setBusyId(listing.listing_id);
    const disabled = !(listing.flags?.disabled || listing.flags?.listing_status === 'disabled');
    try {
      const res = await fetch(`/api/landlord/listings/${listing.listing_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) {
        setError(t('disableError'));
        return;
      }
      setListings((prev) =>
        prev.map((l) =>
          l.listing_id === listing.listing_id
            ? {
                ...l,
                flags: {
                  ...(l.flags || {}),
                  disabled,
                  listing_status: disabled ? 'disabled' : 'live',
                },
              }
            : l,
        ),
      );
    } catch (err) {
      console.error('[LandlordListings] disable failed:', err);
      setError(t('disableError'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <LandlordShell
      eyebrow={tWiz('eyebrow')}
      title={t('title')}
      actions={
        <Button href="/property/thessaloniki/landlord/listings/new" variant="gold" size="sm">
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
          <p className="font-display text-xl text-night/70 mb-5">{t('noListings')}</p>
          <Button href="/property/thessaloniki/landlord/listings/new" variant="primary">
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
                  busy={busyId === listing.listing_id}
                  isVerified={isVerified}
                  onDelete={() => setConfirmTarget(listing)}
                  onDuplicate={() => performDuplicate(listing.listing_id)}
                  onToggleDisable={() => performToggleDisable(listing)}
                  t={t}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={t('deleteTitle')}
          body={t('deleteBody', {
            address: confirmTarget.location?.address || t('noAddress'),
          })}
          confirmLabel={
            busyId === confirmTarget.listing_id ? t('deleting') : t('delete')
          }
          cancelLabel={t('cancel')}
          busy={busyId === confirmTarget.listing_id}
          destructive
          onConfirm={() => performDelete(confirmTarget.listing_id)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </LandlordShell>
  );
}

function ListingRow({
  listing,
  busy,
  isVerified,
  onDelete,
  onDuplicate,
  onToggleDisable,
  t,
}) {
  const photo = listing.photos?.find(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );
  const address = listing.location?.address || t('noAddress');
  const heading = listing.title || address;
  const neighborhood = listing.location?.neighborhood;
  const price = listing.rent?.monthly_price;
  const disabled =
    listing.flags?.disabled === true ||
    listing.flags?.listing_status === 'disabled';
  const stage = deriveListingStage({
    flags: listing.flags,
    isVerified,
    hasVideoVerification: false,
    isSubmitted: listing.flags?.listing_status === 'live',
  });

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative w-full md:w-20 aspect-[4/3] md:aspect-square rounded-sm bg-parchment overflow-hidden shrink-0">
          {photo ? (
            <Image
              src={variantUrl(photo, 'thumb')}
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
            <p className="font-display text-xl text-night truncate">{heading}</p>
            {disabled && <Pill variant="pending">{t('statusDisabled')}</Pill>}
            {!disabled && listing.flags?.listing_status === 'draft' && (
              <Pill variant="amenity">{t('statusDraft')}</Pill>
            )}
          </div>
          <p className="text-xs text-night/50 mb-1 truncate">{address}</p>
          <p className="label-caps text-night/50">
            {neighborhood}
            {listing.property_types?.name && <> · {listing.property_types.name}</>}
            {price != null && <> · €{price}/mo</>}
          </p>
        </div>
      </div>

      <StatusLadder current={stage} />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/property/thessaloniki/listing/${listing.listing_id}`}
          target="_blank"
          className="label-caps px-3 py-1.5 rounded-sm border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors"
        >
          {t('view')}
        </Link>
        <Link
          href={`/property/thessaloniki/landlord/listings/${listing.listing_id}/edit`}
          className="label-caps px-3 py-1.5 rounded-sm border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors"
        >
          {t('edit')}
        </Link>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={busy}
          className="label-caps px-3 py-1.5 rounded-sm border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors disabled:opacity-50"
        >
          {t('duplicate')}
        </button>
        <button
          type="button"
          onClick={onToggleDisable}
          disabled={busy}
          className="label-caps px-3 py-1.5 rounded-sm border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors disabled:opacity-50"
        >
          {disabled ? t('enable') : t('disable')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="label-caps px-3 py-1.5 rounded-sm border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {busy ? t('deleting') : t('delete')}
        </button>
      </div>
    </div>
  );
}
