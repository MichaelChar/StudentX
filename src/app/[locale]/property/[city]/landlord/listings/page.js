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
import StatusLadder from '@/components/listing-wizard/StatusLadder';
import { deriveListingLadder, flagsForDisableToggle } from '@/lib/listingGoLive';
import {
  hasPendingPropertyVerification,
  isPropertyVerified,
  pickLatestRejectedPropertyVerification,
} from '@/lib/propertyVerification';
import { formatMoney } from '@/lib/formatMoney';

/*
  Propylaea landlord listings index — View · Edit · Duplicate · Disable · Delete.
*/
export default function LandlordListingsPage() {
  const t = useTranslations('landlord.dashboard');
  const tWiz = useTranslations('landlord.listingWizard');
  const tPv = useTranslations('propertyVerification');
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
    const currentlyDisabled = isListingDisabled(listing);
    const disabled = !currentlyDisabled;
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
      const toggled = flagsForDisableToggle(
        disabled,
        listing.flags || {},
        listing.listing_status,
      );
      setListings((prev) =>
        prev.map((l) =>
          l.listing_id === listing.listing_id
            ? {
                ...l,
                listing_status: toggled.listing_status,
                flags: toggled.flags,
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

  async function requestPropertyVerification(listingId) {
    setError('');
    setBusyId(listingId);
    try {
      if (!accessToken) {
        router.replace('/property/thessaloniki/landlord/login');
        return;
      }
      const res = await fetch(
        `/api/landlord/listings/${listingId}/property-verification`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || tPv('requestError'));
        return;
      }
      setListings((prev) =>
        prev.map((l) =>
          l.listing_id === listingId
            ? {
                ...l,
                property_verifications: [
                  ...(l.property_verifications || []),
                  body.verification,
                ],
              }
            : l,
        ),
      );
    } catch (err) {
      console.error('[LandlordListings] property verification request failed:', err);
      setError(tPv('requestError'));
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
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-control px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-parchment rounded-card animate-pulse" />
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
                  onRequestVerification={() =>
                    requestPropertyVerification(listing.listing_id)
                  }
                  t={t}
                  tPv={tPv}
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

/** Landlord intentionally took the listing offline (not merely "not yet public"). */
function isListingDisabled(listing) {
  return (
    listing.flags?.disabled === true ||
    listing.flags?.listing_status === 'disabled'
  );
}

function ListingRow({
  listing,
  busy,
  isVerified,
  onDelete,
  onDuplicate,
  onToggleDisable,
  onRequestVerification,
  t,
  tPv,
}) {
  const photo = listing.photos?.find(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );
  const address = listing.location?.address || t('noAddress');
  const heading = listing.title || address;
  const neighborhood = listing.location?.neighborhood;
  const price = listing.rent?.monthly_price;
  const disabled = isListingDisabled(listing);
  const pvRows = listing.property_verifications || [];
  const propertyVerified = isPropertyVerified(pvRows);
  const pendingPv = hasPendingPropertyVerification(pvRows);
  const rejectedPv = pickLatestRejectedPropertyVerification(pvRows);
  const ladder = deriveListingLadder({
    flags: listing.flags,
    listingStatus: listing.listing_status,
    isVerified,
    hasVideoVerification: propertyVerified,
    isSubmitted:
      listing.flags?.listing_status === 'submitted' ||
      listing.flags?.listing_status === 'live' ||
      listing.flags?.admin_live_approved === true,
  });

  const isPublicLive = listing.listing_status === 'active';
  const isSubmitted =
    listing.flags?.listing_status === 'submitted' ||
    listing.flags?.listing_status === 'live' ||
    listing.flags?.admin_live_approved === true;

  // Video call after submit (draft complete), not while still drafting.
  const canRequestPv =
    !propertyVerified &&
    !pendingPv &&
    !disabled &&
    isSubmitted;

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative w-full md:w-20 aspect-[4/3] md:aspect-square rounded-photo bg-parchment overflow-hidden shrink-0">
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
            {!disabled && isPublicLive && (
              <Pill variant="info">{t('statusActive')}</Pill>
            )}
            {!disabled && !isPublicLive && isSubmitted && (
              <Pill variant="pending">{t('statusSubmitted')}</Pill>
            )}
            {!disabled && !isPublicLive && !isSubmitted && (
              <Pill variant="amenity">{t('statusDraft')}</Pill>
            )}
            {propertyVerified && (
              <Pill variant="verified">{tPv('badge')}</Pill>
            )}
            {pendingPv && (
              <Pill variant="pending">{tPv('statusPending')}</Pill>
            )}
          </div>
          <p className="text-xs text-night/50 mb-1 truncate">{address}</p>
          <p className="label-caps text-night/50">
            {neighborhood}
            {listing.property_types?.name && <> · {listing.property_types.name}</>}
            {price != null && (
              <> · {formatMoney(price, listing.rent?.currency)}/mo</>
            )}
          </p>
          {pendingPv && (
            <p className="mt-2 text-sm text-night/60">{tPv('pendingHint')}</p>
          )}
          {!propertyVerified && !pendingPv && rejectedPv?.notes && (
            <p className="mt-2 text-sm text-red-700">
              {tPv('rejectedHint', { notes: rejectedPv.notes })}
            </p>
          )}
        </div>
      </div>

      <StatusLadder current={ladder.current} completed={ladder.completed} />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/property/thessaloniki/listing/${listing.listing_id}`}
          target="_blank"
          className="label-caps px-3 py-1.5 rounded-control border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors"
        >
          {t('view')}
        </Link>
        <Link
          href={`/property/thessaloniki/landlord/listings/${listing.listing_id}/edit`}
          className="label-caps px-3 py-1.5 rounded-control border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors"
        >
          {t('edit')}
        </Link>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={busy}
          className="label-caps px-3 py-1.5 rounded-control border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors disabled:opacity-50"
        >
          {t('duplicate')}
        </button>
        <button
          type="button"
          onClick={onToggleDisable}
          disabled={busy}
          className="label-caps px-3 py-1.5 rounded-control border border-night/20 text-night/60 hover:border-blue hover:text-blue transition-colors disabled:opacity-50"
        >
          {disabled ? t('enable') : t('disable')}
        </button>
        {canRequestPv && (
          <button
            type="button"
            onClick={onRequestVerification}
            disabled={busy}
            className="label-caps px-3 py-1.5 rounded-control border border-blue/40 bg-blue/5 text-blue hover:border-blue hover:bg-blue/10 transition-colors disabled:opacity-50"
          >
            {busy ? tPv('requesting') : tPv('requestCta')}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="label-caps px-3 py-1.5 rounded-control border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {busy ? t('deleting') : t('delete')}
        </button>
      </div>
    </div>
  );
}
