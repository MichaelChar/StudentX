'use client';

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

const PAID_TIERS = [
  {
    key: 'verified',
    name: 'SuperLandlord',
    price: '€49',
    period: '/yr',
    features: [
      { label: 'Listing cap', value: 'Up to 5' },
      { label: 'Photos per listing', value: 'Unlimited' },
      { label: 'Listing expiry', value: 'No expiry' },
      { label: 'Student inquiries', value: 'Unlimited' },
      { label: 'Search position', value: 'Priority placement' },
      { label: 'Verified badge', value: 'Yes' },
      { label: 'Analytics', value: 'Full analytics' },
      { label: 'Response time badge', value: 'Yes' },
      { label: 'Support', value: 'Email' },
    ],
  },
  {
    key: 'verified_pro',
    name: 'SuperLandlord Heavy',
    price: '€99',
    period: '/yr',
    features: [
      { label: 'Listing cap', value: 'Up to 12 (+€5/mo overage)' },
      { label: 'Photos per listing', value: 'Unlimited' },
      { label: 'Listing expiry', value: 'No expiry' },
      { label: 'Student inquiries', value: 'Unlimited' },
      { label: 'Search position', value: 'Priority placement' },
      { label: 'Verified badge', value: 'Yes' },
      { label: 'Analytics', value: 'Full analytics' },
      { label: 'Response time badge', value: 'Yes' },
      { label: 'Support', value: 'Priority' },
    ],
  },
];

export default function GetVerifiedPage() {
  const t = useTranslations('landlord.getVerified');
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/landlord/login');
        return;
      }
      if (!session.user.email_confirmed_at) {
        router.replace('/landlord/verify-email');
        return;
      }
      setLoading(false);
    }
    init();
  }, [router]);

  function handleChoose(tierKey) {
    if (tierKey === 'verified') {
      window.location.href = 'https://buy.stripe.com/bJe7sLdhg0KY7ep3S3awo00';
    } else if (tierKey === 'verified_pro') {
      window.location.href = 'https://buy.stripe.com/00wcN55OO51ebuF60bawo02';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-md px-4">
          <div className="h-8 w-48 bg-gray-light rounded mx-auto" />
          <div className="h-32 bg-gray-light rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <h1 className="font-heading text-3xl font-bold text-navy mb-4 text-center">
        {t('title')}
      </h1>

      <p className="max-w-2xl text-sm text-gray-dark/70 text-center mb-10 leading-relaxed">
        {t('description')}
      </p>

      <div className="w-full max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PAID_TIERS.map((tier) => (
            <div
              key={tier.key}
              className="bg-white rounded-2xl shadow-sm border-2 border-gray-200 flex flex-col"
            >
              <div className="p-6 border-b border-gray-100">
                <h2 className="font-heading text-xl font-bold text-navy mb-1">{tier.name}</h2>
                <div className="flex items-baseline gap-0.5">
                  <span className="font-heading text-3xl font-bold text-navy">{tier.price}</span>
                  {tier.period && (
                    <span className="text-gray-dark/50 text-sm">{tier.period}</span>
                  )}
                </div>
              </div>

              <ul className="p-6 space-y-3 flex-1">
                {tier.features.map((f) => (
                  <li key={f.label} className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-dark/50 uppercase tracking-wide">{f.label}</span>
                    <span className="text-sm font-medium text-navy">{f.value}</span>
                  </li>
                ))}
              </ul>

              <div className="p-6 pt-0">
                <button
                  onClick={() => handleChoose(tier.key)}
                  className="w-full py-3 rounded-xl font-heading font-semibold bg-gold text-white hover:bg-gold/90 transition-colors"
                >
                  {t('chooseTier')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-dark/40 mt-8">
        {t('stripeNote')}
      </p>

      <Link
        href="/landlord/dashboard"
        className="mt-4 text-sm text-gray-dark/60 hover:text-navy transition-colors"
      >
        {t('backToDashboard')}
      </Link>
    </div>
  );
}
