'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

const TIER_STYLES = {
  none: 'bg-gray-100 text-gray-700',
  verified: 'bg-emerald-100 text-emerald-700',
  verified_pro: 'bg-navy/10 text-navy',
};

export default function BillingSection() {
  const t = useTranslations('landlord.billing');
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadBilling();
  }, []);

  async function getToken() {
    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function loadBilling() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/landlord/billing/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) setBilling(await res.json());
    } catch {
      // Billing info unavailable
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(tier) {
    setActionLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/landlord/billing/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier }),
      });

      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const { error } = await res.json();
        alert(error || t('checkoutError'));
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManageBilling() {
    setActionLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/landlord/billing/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const { error } = await res.json();
        alert(error || t('portalError'));
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-32 bg-gray-light rounded" />
        <div className="h-24 bg-gray-light rounded-xl" />
      </div>
    );
  }

  const currentTier = billing?.verifiedTier || 'none';
  const sub = billing?.subscription;
  const listingsCount = billing?.usage?.listingsCount || 0;

  return (
    <div className="space-y-6">
      {/* Current status */}
      <div className="border border-gray-200 rounded-xl p-5 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-semibold text-navy text-lg">
                {t('freeListings')}
              </h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_STYLES[currentTier]}`}>
                {currentTier === 'none' ? t('tierFree') : currentTier === 'verified_pro' ? t('tierVerifiedPro') : t('tierVerified')}
              </span>
            </div>
            <p className="text-sm text-gray-dark/60 mt-1">
              {t('listingsCount', { count: listingsCount })}
            </p>
            {sub && (
              <p className="text-sm text-gray-dark/60 mt-1">
                {t('billingAnnual')} {t('billingSuffix')}
                {sub.cancelAtPeriodEnd && ` — ${t('cancelAtPeriodEnd')}`}
                {sub.currentPeriodEnd && (
                  <> · {t('renews')} {new Date(sub.currentPeriodEnd).toLocaleDateString()}</>
                )}
              </p>
            )}
          </div>
          {sub && (
            <button
              onClick={handleManageBilling}
              disabled={actionLoading}
              className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-dark/70 hover:border-navy hover:text-navy transition-colors disabled:opacity-50"
            >
              {t('manageBilling')}
            </button>
          )}
        </div>
      </div>

      {/* Verification tiers — shown to non-verified landlords */}
      {currentTier === 'none' && (
        <div>
          <h3 className="font-heading font-semibold text-navy text-base mb-3">
            {t('boostListings')}
          </h3>
          <p className="text-sm text-gray-dark/60 mb-4">
            {t('verifiedDescription')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Verified */}
            <div className="border border-gray-200 rounded-xl p-5 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  {t('tierVerified')}
                </span>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-navy">&euro;49</span>
                <span className="text-sm text-gray-dark/60">{t('perYear')}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-dark/70">
                <li>{t('benefitBadge')}</li>
                <li>{t('benefitSearchBoost')}</li>
              </ul>
              <button
                onClick={() => handleCheckout('verified')}
                disabled={actionLoading}
                className="mt-4 w-full text-sm px-3 py-2 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                {t('getVerified')}
              </button>
            </div>

            {/* Verified Pro */}
            <div className="border-2 border-navy rounded-xl p-5 bg-navy/5">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-navy text-white">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  {t('tierVerifiedPro')}
                </span>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-navy">&euro;99</span>
                <span className="text-sm text-gray-dark/60">{t('perYear')}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-dark/70">
                <li>{t('benefitBadge')}</li>
                <li>{t('benefitPriorityPlacement')}</li>
                <li>{t('benefitAnalytics')}</li>
              </ul>
              <button
                onClick={() => handleCheckout('verified_pro')}
                disabled={actionLoading}
                className="mt-4 w-full text-sm px-3 py-2 rounded-lg bg-navy text-white font-medium hover:bg-navy/90 transition-colors disabled:opacity-50"
              >
                {t('getVerifiedPro')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade option for Verified → Verified Pro */}
      {currentTier === 'verified' && (
        <div className="border-2 border-navy rounded-xl p-5 bg-navy/5">
          <h3 className="font-heading font-semibold text-navy text-base mb-2">
            {t('upgradeToVerifiedPro')}
          </h3>
          <p className="text-sm text-gray-dark/60 mb-3">{t('upgradeProDescription')}</p>
          <ul className="mb-4 space-y-1.5 text-sm text-gray-dark/70">
            <li>{t('benefitPriorityPlacement')}</li>
            <li>{t('benefitAnalytics')}</li>
          </ul>
          <button
            onClick={() => handleCheckout('verified_pro')}
            disabled={actionLoading}
            className="text-sm px-4 py-2 rounded-lg bg-navy text-white font-medium hover:bg-navy/90 transition-colors disabled:opacity-50"
          >
            {t('upgradeButton99')}
          </button>
        </div>
      )}
    </div>
  );
}
