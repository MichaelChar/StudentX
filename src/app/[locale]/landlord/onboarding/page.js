'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

const TIERS = [
  {
    key: 'free',
    name: 'Free',
    price: '€0',
    period: null,
    recommended: false,
    features: [
      { label: 'Listing cap', value: '3' },
      { label: 'Photos per listing', value: '6' },
      { label: 'Listing expiry', value: '90 days (renewable)' },
      { label: 'Student inquiries', value: 'Unlimited' },
      { label: 'Search position', value: 'Standard' },
      { label: 'Verified badge', value: 'No' },
      { label: 'Analytics', value: 'None' },
      { label: 'Response time badge', value: 'No' },
      { label: 'Support', value: '—' },
    ],
  },
  {
    key: 'verified',
    name: 'Verified',
    price: '€49',
    period: '/yr',
    recommended: false,
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
    name: 'Verified Pro',
    price: '€99',
    period: '/yr',
    recommended: true,
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

export default function LandlordOnboardingPage() {
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
    if (tierKey === 'free') {
      router.push('/landlord/dashboard');
    } else if (tierKey === 'verified') {
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
      <h1 className="font-heading text-3xl font-bold text-navy mb-2 text-center">
        Choose your plan
      </h1>
      <p className="text-sm text-gray-dark/60 text-center mb-10">
        Pick the tier that fits your needs. You can upgrade anytime.
      </p>

      <div className="w-full max-w-5xl overflow-x-auto">
        <div className="grid grid-cols-3 gap-4 min-w-[640px]">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={`relative bg-white rounded-2xl shadow-sm border-2 flex flex-col ${
                tier.recommended ? 'border-gold' : 'border-gray-200'
              }`}
            >
              {tier.recommended && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-block bg-gold text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    Recommended
                  </span>
                </div>
              )}

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
                  className={`w-full py-3 rounded-xl font-heading font-semibold transition-colors ${
                    tier.key === 'free'
                      ? 'bg-navy text-white hover:bg-navy/90'
                      : 'bg-gold text-white hover:bg-gold/90'
                  }`}
                >
                  Choose this tier
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-dark/40 mt-8">
        Paid plans use secure checkout via Stripe. Cancel anytime.
      </p>
    </div>
  );
}
