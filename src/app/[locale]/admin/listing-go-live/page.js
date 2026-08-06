'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

const FILTERS = ['candidates', 'live', 'all'];

const MISSING_LABELS = {
  not_submitted: 'Not submitted',
  id_check: 'Landlord ID not verified',
  video_call: 'Video call not complete',
};

export default function AdminListingGoLivePage() {
  const t = useTranslations('admin.listingGoLive');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [filter, setFilter] = useState('candidates');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(t('notAuthenticated'));
        setLoading(false);
        return;
      }
      setToken(session.access_token);
      await fetchListings(session.access_token, 'candidates');
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchListings(tok, f) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/listing-go-live?filter=${f}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t('loadError'));
        return;
      }
      const { listings: data } = await res.json();
      setListings(data || []);
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(f) {
    setFilter(f);
    fetchListings(token, f);
  }

  async function handleAction(listingId, action) {
    setBusyId(listingId);
    setError('');
    try {
      const res = await fetch('/api/admin/listing-go-live', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listing_id: listingId, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const missing = Array.isArray(body.missing)
          ? body.missing.map((m) => MISSING_LABELS[m] || m).join('; ')
          : '';
        setError(
          missing
            ? `${body.error || t('actionError')}: ${missing}`
            : body.error || t('actionError'),
        );
        return;
      }
      await fetchListings(token, filter);
    } catch {
      setError(t('actionError'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <p className="label-caps text-night/50 mb-1">{t('eyebrow')}</p>
          <h1 className="font-display text-2xl font-bold text-night">{t('title')}</h1>
          <p className="text-sm text-night/60 mt-1 max-w-xl">{t('lede')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => handleFilterChange(f)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                filter === f
                  ? 'bg-night text-white border-night'
                  : 'border-gray-200 text-night/60 hover:border-night/40'
              }`}
            >
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-night/50">{t('loading')}</p>
      ) : listings.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-sm">
          <p className="text-night/50">{t('empty', { filter })}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((row) => {
            const busy = busyId === row.listing_id;
            const isLive = row.listing_status === 'active';
            return (
              <Card key={row.listing_id} tone="white" className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-display font-semibold text-night truncate">
                        {row.title || row.address || row.listing_id}
                      </p>
                      <StatusPill live={isLive} t={t} />
                    </div>
                    <p className="text-xs text-night/50 mb-1">
                      {row.listing_id}
                      {row.address ? ` · ${row.address}` : ''}
                      {row.neighborhood ? ` · ${row.neighborhood}` : ''}
                      {row.monthly_price != null ? ` · €${row.monthly_price}/mo` : ''}
                    </p>
                    <p className="text-sm text-night/70">
                      {t('landlordLine', {
                        name: row.landlord_name || t('unknownLandlord'),
                      })}
                      {row.landlord_email ? ` · ${row.landlord_email}` : ''}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                      <GateChip ok={row.submitted} label={t('gateSubmitted')} />
                      <GateChip ok={row.id_verified} label={t('gateId')} />
                      <GateChip ok={row.video_verified} label={t('gateVideo')} />
                    </ul>
                    {!row.can_go_live && !isLive && row.missing?.length > 0 && (
                      <p className="mt-2 text-xs text-night/50">
                        {t('missingPrefix')}{' '}
                        {row.missing
                          .map((m) => MISSING_LABELS[m] || m)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {!isLive && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={busy || !row.can_go_live}
                        onClick={() => handleAction(row.listing_id, 'approve')}
                      >
                        {busy ? t('approving') : t('approve')}
                      </Button>
                    )}
                    {isLive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleAction(row.listing_id, 'revoke')}
                      >
                        {busy ? t('revoking') : t('revoke')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusPill({ live, t }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
        live
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-parchment text-night/60 border-night/15'
      }`}
    >
      {live ? t('statusLive') : t('statusOffline')}
    </span>
  );
}

function GateChip({ ok, label }) {
  return (
    <li
      className={`px-2 py-1 rounded-sm border ${
        ok
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-parchment text-night/50 border-night/10'
      }`}
    >
      {ok ? '✓' : '○'} {label}
    </li>
  );
}
