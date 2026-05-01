'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import VerifiedSeal from '@/components/ui/VerifiedSeal';
import { useAccessToken } from '@/lib/useAccessToken';

/*
  Propylaea pricing / Get Verified page. Two tiers, seal-gold accents,
  EB Garamond tier names, parchment comparison card.
*/

const PAID_TIERS = [
  {
    key: 'verified',
    name: 'SuperLandlord',
    tagline: 'For landlords with 1–5 listings',
    price: '€49',
    period: '/yr',
    highlight: false,
    features: [
      { label: 'Listing cap', value: 'Up to 5' },
      { label: 'Photos per listing', value: 'Unlimited' },
      { label: 'Verified badge', value: 'Yes' },
      { label: 'Priority placement', value: 'Yes' },
      { label: 'Analytics', value: 'Full' },
      { label: 'Support', value: 'Email' },
    ],
  },
  {
    key: 'verified_pro',
    name: 'SuperLandlord Heavy',
    tagline: 'For portfolios with 6–12 listings',
    price: '€99',
    period: '/yr',
    highlight: true,
    features: [
      { label: 'Listing cap', value: 'Up to 12 (+€5/mo overage)' },
      { label: 'Photos per listing', value: 'Unlimited' },
      { label: 'Verified badge', value: 'Yes' },
      { label: 'Priority placement', value: 'Yes' },
      { label: 'Analytics', value: 'Full' },
      { label: 'Support', value: 'Priority' },
    ],
  },
];

export default function GetVerifiedPage() {
  const t = useTranslations('landlord.getVerified');
  const tBilling = useTranslations('landlord.billing');
  const accessToken = useAccessToken();
  const [pendingTier, setPendingTier] = useState(null);
  const [error, setError] = useState('');

  async function handleChoose(tierKey) {
    setError('');
    setPendingTier(tierKey);
    try {
      const res = await fetch('/api/landlord/billing/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: tierKey }),
      });
      const { url, error: apiError } = await res.json();
      if (!res.ok || !url) {
        setError(apiError || tBilling('checkoutError'));
        setPendingTier(null);
        return;
      }
      window.location.assign(url);
    } catch (err) {
      console.error('[GetVerified] checkout failed:', err);
      setError(tBilling('checkoutError'));
      setPendingTier(null);
    }
  }

  return (
    <LandlordShell eyebrow="Pricing" title={t('title')}>
      <div className="max-w-4xl">
        <p className="text-night/70 text-base md:text-lg leading-relaxed mb-10 max-w-2xl">
          {t('description')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PAID_TIERS.map((tier) => (
            <TierCard
              key={tier.key}
              tier={tier}
              onChoose={() => handleChoose(tier.key)}
              ctaLabel={t('chooseTier')}
              disabled={pendingTier !== null}
              loading={pendingTier === tier.key}
            />
          ))}
        </div>

        {error && (
          <p className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2 max-w-2xl">
            {error}
          </p>
        )}

        <p className="mt-8 label-caps text-night/40">{t('stripeNote')}</p>
      </div>
    </LandlordShell>
  );
}

function TierCard({ tier, onChoose, ctaLabel, disabled = false, loading = false }) {
  return (
    <Card
      tone={tier.highlight ? 'night' : 'white'}
      className={`p-7 md:p-8 flex flex-col relative ${
        tier.highlight ? 'text-stone' : ''
      }`}
    >
      {tier.highlight && (
        <span className="absolute -top-3 right-6">
          <Pill variant="verified">Most popular</Pill>
        </span>
      )}

      <div className="flex items-center gap-3 mb-2">
        {tier.highlight ? (
          <VerifiedSeal size={28} />
        ) : (
          <div className="w-7 h-7 rounded-full border border-gold/50 flex items-center justify-center">
            <Icon name="shield" className="w-3.5 h-3.5 text-gold" />
          </div>
        )}
        <p className="label-caps text-gold">{tier.key.replace('_', ' ')}</p>
      </div>

      <h3
        className={`font-display text-2xl md:text-3xl leading-tight ${
          tier.highlight ? 'text-stone' : 'text-night'
        }`}
      >
        {tier.name}
      </h3>
      <p
        className={`text-sm mt-1 ${
          tier.highlight ? 'text-stone/70' : 'text-night/60'
        }`}
      >
        {tier.tagline}
      </p>

      <div className="mt-6 flex items-baseline gap-1">
        <span
          className={`font-display text-5xl ${
            tier.highlight ? 'text-gold' : 'text-blue'
          }`}
        >
          {tier.price}
        </span>
        <span
          className={`text-sm ${
            tier.highlight ? 'text-stone/60' : 'text-night/50'
          }`}
        >
          {tier.period}
        </span>
      </div>

      <ul
        className={`mt-8 space-y-3 flex-1 ${
          tier.highlight ? 'divide-stone/10' : 'divide-night/10'
        }`}
      >
        {tier.features.map((f) => (
          <li key={f.label} className="flex items-start gap-2">
            <Icon
              name="check"
              className={`w-4 h-4 shrink-0 mt-1 ${
                tier.highlight ? 'text-gold' : 'text-gold'
              }`}
            />
            <div>
              <p
                className={`label-caps ${
                  tier.highlight ? 'text-stone/50' : 'text-night/50'
                }`}
              >
                {f.label}
              </p>
              <p
                className={`text-sm font-medium ${
                  tier.highlight ? 'text-stone' : 'text-night'
                }`}
              >
                {f.value}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Button
          onClick={onChoose}
          variant={tier.highlight ? 'gold' : 'primary'}
          className="w-full justify-center"
          disabled={disabled}
        >
          {loading ? '…' : ctaLabel}
        </Button>
      </div>
    </Card>
  );
}
