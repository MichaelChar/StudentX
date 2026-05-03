'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import LandlordShell from '@/components/landlord/LandlordShell';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import { Link } from '@/i18n/navigation';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LandlordInquiriesPage() {
  const t = useTranslations('landlord.inquiries');
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(null);
  const [token, setToken] = useState('');

  const fetchInquiries = useCallback(async (accessToken) => {
    try {
      const res = await fetch('/api/landlord/inquiries', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const { error: e } = await res.json();
        setError(e || t('loadError'));
        return;
      }
      const { inquiries: data } = await res.json();
      setInquiries(data || []);
    } catch {
      setError(t('loadError'));
    }
  }, [t]);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      await fetchInquiries(session.access_token);
      setLoading(false);
    })();
  }, [fetchInquiries]);

  async function handleStatusChange(inquiryId, newStatus) {
    setUpdating(inquiryId);
    try {
      const res = await fetch(`/api/landlord/inquiries/${inquiryId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const { error: e } = await res.json();
        alert(e || t('updateError'));
        return;
      }
      const { inquiry: updated } = await res.json();
      setInquiries((prev) =>
        prev.map((inq) =>
          inq.inquiry_id === inquiryId
            ? { ...inq, status: updated.status, replied_at: updated.replied_at }
            : inq
        )
      );
    } catch {
      alert(t('updateError'));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <LandlordShell eyebrow="Inbox" title={t('title')}>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-parchment rounded-sm animate-pulse" />
          ))}
        </div>
      ) : inquiries.length === 0 ? (
        <Card tone="parchment" className="p-12 text-center">
          <Icon name="message" className="w-12 h-12 mx-auto text-night/30 mb-3" />
          <p className="font-display text-xl text-night/60">
            {t('noInquiries')}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {inquiries.map((inq) => (
            <InquiryCard
              key={inq.inquiry_id}
              inquiry={inq}
              updating={updating === inq.inquiry_id}
              onStatusChange={handleStatusChange}
              t={t}
            />
          ))}
        </div>
      )}
    </LandlordShell>
  );
}

function statusVariant(status) {
  if (status === 'pending') return 'verified';
  if (status === 'replied') return 'info';
  return 'amenity';
}

function InquiryCard({ inquiry, updating, onStatusChange, t }) {
  const address = inquiry.listings?.location?.address || `#${inquiry.listing_id}`;

  return (
    <Card tone="white" className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="font-display text-xl text-night">
              {inquiry.student_name}
            </p>
            <Pill variant={statusVariant(inquiry.status)}>
              {t(`status_${inquiry.status}`)}
            </Pill>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-night/60">
            <a
              href={`mailto:${inquiry.student_email}`}
              className="hover:text-blue transition-colors"
            >
              {inquiry.student_email}
            </a>
            {inquiry.student_phone && <span>{inquiry.student_phone}</span>}
          </div>
        </div>
        <div className="text-right text-xs text-night/50 shrink-0">
          <p className="label-caps">{formatDate(inquiry.created_at)}</p>
          <p className="mt-1 truncate max-w-[180px]">{address}</p>
        </div>
      </div>

      <blockquote className="bg-parchment rounded-sm px-5 py-4 text-night/80 leading-relaxed mb-4 font-sans text-sm md:text-base">
        {inquiry.message}
      </blockquote>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/property/landlord/inquiries/${inquiry.inquiry_id}/chat`}
          className="inline-flex items-center justify-center gap-1 bg-blue text-white text-xs font-sans font-semibold uppercase tracking-[0.08em] px-3 py-1.5 rounded hover:bg-night transition-colors"
        >
          <Icon name="message" className="w-3.5 h-3.5" />
          {t('openChat')}
        </Link>
        {inquiry.status === 'pending' && (
          <Button
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={() => onStatusChange(inquiry.inquiry_id, 'replied')}
          >
            {updating ? '…' : t('markReplied')}
          </Button>
        )}
        {inquiry.status !== 'closed' && (
          <Button
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={() => onStatusChange(inquiry.inquiry_id, 'closed')}
          >
            {updating ? '…' : t('markClosed')}
          </Button>
        )}
        {inquiry.status === 'closed' && (
          <Button
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={() => onStatusChange(inquiry.inquiry_id, 'pending')}
          >
            {updating ? '…' : t('reopen')}
          </Button>
        )}
      </div>
    </Card>
  );
}
