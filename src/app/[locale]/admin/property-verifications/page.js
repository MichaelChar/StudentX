'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { PROPERTY_VERIFICATION_CHECKLIST } from '@/lib/propertyVerification';
import { variantUrl } from '@/lib/photoVariants';

const STATUS_FILTERS = ['pending', 'approved', 'rejected'];

const CHECKLIST_I18N = {
  rooms_match_photos: 'checklistRooms',
  address_confirmed: 'checklistAddress',
  access_demonstrated: 'checklistAccess',
  heating_bills_confirmed: 'checklistHeating',
};

export default function AdminPropertyVerificationsPage() {
  const t = useTranslations('admin.propertyVerifications');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [actionStates, setActionStates] = useState({});
  const [notesMap, setNotesMap] = useState({});
  const [checklistMap, setChecklistMap] = useState({});

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
      await fetchRequests(session.access_token, 'pending');
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRequests(tok, status) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/property-verifications?status=${status}`,
        { headers: { Authorization: `Bearer ${tok}` } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t('loadError'));
        return;
      }
      const { requests: data } = await res.json();
      setRequests(data || []);
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(status) {
    setStatusFilter(status);
    setExpandedId(null);
    fetchRequests(token, status);
  }

  function toggleChecklist(id, key) {
    setChecklistMap((prev) => {
      const current = prev[id] || {};
      return {
        ...prev,
        [id]: { ...current, [key]: !current[key] },
      };
    });
  }

  async function handleAction(id, action) {
    setActionStates((prev) => ({
      ...prev,
      [id]: action === 'approve' ? 'approving' : 'rejecting',
    }));
    try {
      const res = await fetch(`/api/admin/property-verifications/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          notes: notesMap[id] || undefined,
          checklist: checklistMap[id] || {},
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t('actionError'));
      } else {
        setRequests((prev) => prev.filter((r) => r.verification_id !== id));
        setExpandedId(null);
      }
    } catch {
      setError(t('actionError'));
    } finally {
      setActionStates((prev) => ({ ...prev, [id]: null }));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-night/50">{t('loading')}</p>
      </div>
    );
  }

  if (error && requests.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-red-700 bg-red-50 border border-red-200 rounded-sm px-6 py-4">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <p className="label-caps text-night/50 mb-1">{t('eyebrow')}</p>
          <h1 className="font-display text-2xl font-bold text-night">{t('title')}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleFilterChange(s)}
              className={`text-sm px-3 py-1.5 rounded-sm border transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-night text-white border-night'
                  : 'border-night/15 text-night/60 hover:border-night/40'
              }`}
            >
              {t(`status.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {requests.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-night/15 rounded-sm">
          <p className="text-night/50">{t('empty', { status: t(`status.${statusFilter}`) })}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {requests.map((req) => {
            const expanded = expandedId === req.verification_id;
            const checklist = checklistMap[req.verification_id] || {};
            const photos = (req.listing_photos || []).filter(
              (url) => typeof url === 'string' && url.startsWith('http'),
            );
            return (
              <Card key={req.verification_id} tone="white" className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-display font-semibold text-night">
                        {req.listing_title || req.address || req.listing_id}
                      </span>
                      <StatusBadge status={req.status} t={t} />
                    </div>
                    <p className="text-xs text-night/50 mb-1">
                      {req.address}
                      {req.neighborhood ? ` · ${req.neighborhood}` : ''}
                      {req.monthly_price != null ? ` · €${req.monthly_price}/mo` : ''}
                    </p>
                    <p className="text-sm text-night/70">
                      {t('landlordLine', {
                        name: req.landlord_name || t('unknownLandlord'),
                      })}
                    </p>
                    {req.landlord_phone && (
                      <p className="text-sm text-night/70 mt-0.5">
                        {t('phoneLine', { phone: req.landlord_phone })}
                      </p>
                    )}
                    <p className="text-xs text-night/40 mt-2">
                      {t('submitted', {
                        date: new Date(req.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        }),
                      })}
                    </p>
                    {req.verified_at && (
                      <p className="text-xs text-night/40">
                        {t('reviewed', {
                          date: new Date(req.verified_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          }),
                        })}
                      </p>
                    )}
                    {req.notes && req.status !== 'pending' && (
                      <p className="text-sm text-night/60 mt-1 italic">{req.notes}</p>
                    )}
                  </div>

                  {req.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expanded ? null : req.verification_id)
                      }
                      className="shrink-0 text-sm px-3 py-1.5 rounded-sm border border-night/15 text-night/70 hover:border-night hover:text-night transition-colors"
                    >
                      {expanded ? t('collapse') : t('openCall')}
                    </button>
                  )}
                </div>

                {expanded && req.status === 'pending' && (
                  <div className="mt-5 pt-5 border-t border-night/10 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <p className="label-caps text-night/50 mb-3">{t('listingPhotos')}</p>
                      {photos.length === 0 ? (
                        <div className="aspect-[4/3] rounded-sm bg-parchment flex items-center justify-center">
                          <Icon name="photo" className="w-10 h-10 text-night/20" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {photos.slice(0, 6).map((url) => (
                            <div
                              key={url}
                              className="relative aspect-[4/3] rounded-sm overflow-hidden bg-parchment"
                            >
                              <Image
                                src={variantUrl(url, 'card')}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="200px"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {req.listing_description && (
                        <p className="mt-3 text-sm text-night/70 leading-relaxed line-clamp-6">
                          {req.listing_description}
                        </p>
                      )}
                      {req.landlord_phone && (
                        <p className="mt-3 text-sm text-night font-medium">
                          {t('scheduleHint', { phone: req.landlord_phone })}
                        </p>
                      )}
                    </div>

                    <div className="space-y-4">
                      <p className="label-caps text-night/50">{t('checklistTitle')}</p>
                      <ul className="space-y-2">
                        {PROPERTY_VERIFICATION_CHECKLIST.map((key) => (
                          <li key={key}>
                            <label className="flex items-start gap-3 cursor-pointer text-sm text-night">
                              <input
                                type="checkbox"
                                checked={Boolean(checklist[key])}
                                onChange={() =>
                                  toggleChecklist(req.verification_id, key)
                                }
                                className="mt-0.5 h-4 w-4 rounded-sm border-night/30 text-blue focus:ring-blue/40"
                              />
                              <span>{t(CHECKLIST_I18N[key])}</span>
                            </label>
                          </li>
                        ))}
                      </ul>

                      <div>
                        <label className="label-caps text-night/50 mb-2 block">
                          {t('notesLabel')}
                        </label>
                        <textarea
                          placeholder={t('notesPlaceholder')}
                          value={notesMap[req.verification_id] || ''}
                          onChange={(e) =>
                            setNotesMap((prev) => ({
                              ...prev,
                              [req.verification_id]: e.target.value,
                            }))
                          }
                          rows={3}
                          className="w-full rounded-sm border border-night/15 bg-parchment px-3 py-2 text-sm text-night focus:outline-none focus:ring-2 focus:ring-yellow/50 focus:border-yellow resize-none"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={!!actionStates[req.verification_id]}
                          onClick={() =>
                            handleAction(req.verification_id, 'approve')
                          }
                        >
                          {actionStates[req.verification_id] === 'approving'
                            ? t('approving')
                            : t('approve')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!!actionStates[req.verification_id]}
                          onClick={() =>
                            handleAction(req.verification_id, 'reject')
                          }
                        >
                          {actionStates[req.verification_id] === 'rejecting'
                            ? t('rejecting')
                            : t('reject')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, t }) {
  const styles = {
    pending: 'bg-yellow/20 text-night border-yellow/40',
    approved: 'bg-blue/10 text-blue border-blue/30',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm border capitalize ${styles[status] || ''}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
