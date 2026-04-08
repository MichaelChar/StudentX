'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

const STATUS_ORDER = ['pending', 'replied', 'closed'];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LandlordInquiriesPage() {
  const t = useTranslations('landlord.inquiries');
  const router = useRouter();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/landlord/login');
        return;
      }
      setToken(session.access_token);
      // Ensure landlord profile exists before fetching inquiries
      await fetch('/api/landlord/profile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      await fetchInquiries(session.access_token);
    }
    init();
  }, [router]);

  async function fetchInquiries(accessToken) {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

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

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-light rounded" />
          <div className="h-24 bg-gray-light rounded-xl" />
          <div className="h-24 bg-gray-light rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-2xl font-bold text-navy">{t('title')}</h1>
        <Link
          href="/landlord/dashboard"
          className="text-sm text-gray-dark/60 hover:text-navy transition-colors"
        >
          ← {t('backToDashboard')}
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {inquiries.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-dark/50">{t('noInquiries')}</p>
        </div>
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
    </div>
  );
}

function StatusBadge({ status, t }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    replied: 'bg-green-50 text-green-700 border-green-200',
    closed: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}>
      {t(`status_${status}`)}
    </span>
  );
}

function InquiryCard({ inquiry, updating, onStatusChange, t }) {
  const address = inquiry.listings?.location?.address || `#${inquiry.listing_id}`;

  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-heading font-semibold text-navy text-sm">
              {inquiry.student_name}
            </span>
            <StatusBadge status={inquiry.status} t={t} />
          </div>
          <div className="text-xs text-gray-dark/50 space-x-3">
            <a
              href={`mailto:${inquiry.student_email}`}
              className="hover:text-gold transition-colors"
            >
              {inquiry.student_email}
            </a>
            {inquiry.student_phone && (
              <span>{inquiry.student_phone}</span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-dark/40 shrink-0 text-right">
          <div>{formatDate(inquiry.created_at)}</div>
          <div className="mt-0.5 text-gray-dark/30 truncate max-w-[140px]">{address}</div>
        </div>
      </div>

      <p className="text-sm text-gray-dark/80 bg-gray-light rounded-lg px-4 py-3 leading-relaxed">
        {inquiry.message}
      </p>

      <div className="flex items-center gap-2 pt-1">
        {inquiry.status === 'pending' && (
          <button
            onClick={() => onStatusChange(inquiry.inquiry_id, 'replied')}
            disabled={updating}
            className="text-xs px-3 py-1.5 rounded-lg bg-navy text-white font-medium hover:bg-navy/90 transition-colors disabled:opacity-50"
          >
            {updating ? '…' : t('markReplied')}
          </button>
        )}
        {inquiry.status !== 'closed' && (
          <button
            onClick={() => onStatusChange(inquiry.inquiry_id, 'closed')}
            disabled={updating}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-dark/60 hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            {updating ? '…' : t('markClosed')}
          </button>
        )}
        {inquiry.status === 'closed' && (
          <button
            onClick={() => onStatusChange(inquiry.inquiry_id, 'pending')}
            disabled={updating}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-dark/60 hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            {updating ? '…' : t('reopen')}
          </button>
        )}
      </div>
    </div>
  );
}
