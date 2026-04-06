'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

const PLAN_COLORS = {
  free: 'bg-gray-100 text-gray-700',
  pro: 'bg-gold/20 text-gold',
  super_pro: 'bg-navy/10 text-navy',
};

export default function BillingSection() {
  const t = useTranslations('landlord.billing');
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState([]);
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

      const [subRes, plansRes] = await Promise.all([
        fetch('/api/landlord/billing/subscription', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/landlord/billing/plans'),
      ]);

      if (subRes.ok) setBilling(await subRes.json());
      if (plansRes.ok) {
        const { plans: p } = await plansRes.json();
        setPlans(p || []);
      }
    } catch {
      // Billing info unavailable
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(planId) {
    setActionLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/landlord/billing/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId }),
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

  const currentPlanId = billing?.plan?.planId || 'free';
  const usage = billing?.usage;
  const sub = billing?.subscription;

  return (
    <div className="space-y-6">
      {/* Current plan & usage */}
      <div className="border border-gray-200 rounded-xl p-5 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-semibold text-navy text-lg">
                {billing?.plan?.name || t('planBadgeFree')} {t('planSuffix')}
              </h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[currentPlanId] || PLAN_COLORS.free}`}>
                {currentPlanId === 'free' ? t('planBadgeFree') : t('planBadgeActive')}
              </span>
            </div>
            {sub && (
              <p className="text-sm text-gray-dark/60 mt-1">
                {sub.billingInterval === 'annual' ? t('billingAnnual') : t('billingMonthly')} {t('billingSuffix')}
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

        {/* Usage bar */}
        {usage && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-dark/60">{t('listingsUsed')}</span>
              <span className="font-medium text-navy">
                {usage.listingsUsed} / {usage.listingsMax}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-gold rounded-full h-2 transition-all"
                style={{ width: `${Math.min(100, (usage.listingsUsed / usage.listingsMax) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Upgrade plans */}
      {plans.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold text-navy text-base mb-3">
            {currentPlanId === 'free' ? t('upgradePlan') : t('availablePlans')}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans
              .filter((p) => p.plan_id !== 'free')
              .map((plan) => {
                const isCurrent = plan.plan_id === currentPlanId;
                const annualPrice = (plan.annual_price_cents / 100).toFixed(0);
                const hasOverage = plan.overage_price_cents > 0;
                return (
                  <div
                    key={plan.plan_id}
                    className={`border rounded-xl p-4 ${isCurrent ? 'border-gold bg-gold/5' : 'border-gray-200 bg-white'}`}
                  >
                    <h4 className="font-heading font-semibold text-navy">{plan.name}</h4>
                    <p className="text-sm text-gray-dark/60 mt-1">{plan.description}</p>
                    <div className="mt-3">
                      <span className="text-2xl font-bold text-navy">€{annualPrice}</span>
                      <span className="text-sm text-gray-dark/60">{t('perYear')}</span>
                    </div>
                    <p className="text-sm text-gray-dark/60 mt-1">
                      {t('upToListings', { count: plan.max_listings })}
                    </p>
                    {hasOverage && (
                      <p className="text-xs text-gray-dark/50 mt-0.5">
                        {t('overagePrice', { price: (plan.overage_price_cents / 100).toFixed(0) })}
                      </p>
                    )}

                    {isCurrent ? (
                      <div className="mt-4 text-center text-sm font-medium text-gold">
                        {t('currentPlanBadge')}
                      </div>
                    ) : (
                      <div className="mt-4">
                        <button
                          onClick={() => handleCheckout(plan.plan_id)}
                          disabled={actionLoading}
                          className="w-full text-sm px-3 py-2 rounded-lg bg-navy text-white font-medium hover:bg-navy/90 transition-colors disabled:opacity-50"
                        >
                          {t('upgradeButton', { price: annualPrice })}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
