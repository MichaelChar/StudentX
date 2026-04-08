'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

const PLANS = {
  verified: {
    name: 'superLandlord',
    price: 49,
    period: 'yr',
    features: ['Up to 5 properties', 'Verified badge', 'Priority listing placement', 'Student inquiry alerts'],
  },
  verified_pro: {
    name: 'superLandlord Heavy',
    price: 99,
    period: 'yr',
    features: ['Up to 12 properties', 'Verified badge', 'Priority listing placement', 'Student inquiry alerts', 'Analytics dashboard'],
  },
};

export default function LandlordOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1 = property count, '1b' = exact count, 2 = pitch
  const [selectedTier, setSelectedTier] = useState(null);
  const [exactCount, setExactCount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState(null);

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
      setToken(session.access_token);
      setLoading(false);
    }
    init();
  }, [router]);

  function handlePropertyCount(choice) {
    if (choice === 'small') {
      setSelectedTier('verified');
      setStep(2);
    } else if (choice === 'medium') {
      setSelectedTier('verified_pro');
      setStep(2);
    } else {
      setStep('1b');
    }
  }

  function handleExactCountSubmit(e) {
    e.preventDefault();
    const count = parseInt(exactCount, 10);
    if (!count || count <= 12) return;
    setSelectedTier('verified_pro');
    setStep(2);
  }

  function handleProceed() {
    setSubmitting(true);
    setError('');

    const count = parseInt(exactCount, 10) || 0;
    let stripeUrl;

    if (selectedTier === 'verified') {
      // superLandlord (1-5 properties)
      stripeUrl = 'https://buy.stripe.com/test_4gM6oHb98dxKaqBewHawo03';
    } else if (selectedTier === 'verified_pro' && count > 12) {
      // superLandlord Heavy + additional properties (13+)
      stripeUrl = 'https://buy.stripe.com/test_5kQcN55OO51egOZ3S3awo04';
    } else {
      // superLandlord Heavy (6-12 properties)
      stripeUrl = 'https://buy.stripe.com/test_bJe7sLdhg0KY7ep3S3awo00';
    }

    window.location.href = stripeUrl;
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

  const plan = selectedTier ? PLANS[selectedTier] : null;
  const exactCountNum = parseInt(exactCount, 10);
  const overage = selectedTier === 'verified_pro' && exactCountNum > 12 ? exactCountNum - 12 : 0;
  const totalPrice = plan ? plan.price + overage * 5 : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                (step === 1 || step === '1b') && s === 1
                  ? 'w-6 bg-navy'
                  : step === 2 && s === 2
                  ? 'w-6 bg-navy'
                  : step === 2 && s === 1
                  ? 'w-6 bg-navy/30'
                  : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Property Count */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h1 className="font-heading text-2xl font-bold text-navy mb-2 text-center">
              How many properties do you have?
            </h1>
            <p className="text-sm text-gray-dark/60 text-center mb-8">
              We&apos;ll recommend the right plan for you.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handlePropertyCount('small')}
                className="w-full text-left px-5 py-4 rounded-xl border-2 border-gray-200 hover:border-navy hover:bg-navy/5 transition-all group"
              >
                <span className="font-heading font-semibold text-navy text-base group-hover:text-navy">
                  5 or less
                </span>
                <p className="text-sm text-gray-dark/60 mt-0.5">superLandlord — €49/yr</p>
              </button>
              <button
                onClick={() => handlePropertyCount('medium')}
                className="w-full text-left px-5 py-4 rounded-xl border-2 border-gray-200 hover:border-navy hover:bg-navy/5 transition-all group"
              >
                <span className="font-heading font-semibold text-navy text-base">
                  12 or less
                </span>
                <p className="text-sm text-gray-dark/60 mt-0.5">superLandlord Heavy — €99/yr</p>
              </button>
              <button
                onClick={() => handlePropertyCount('large')}
                className="w-full text-left px-5 py-4 rounded-xl border-2 border-gray-200 hover:border-navy hover:bg-navy/5 transition-all"
              >
                <span className="font-heading font-semibold text-navy text-base">
                  More than 12
                </span>
                <p className="text-sm text-gray-dark/60 mt-0.5">Custom pricing applies</p>
              </button>
            </div>
          </div>
        )}

        {/* Step 1b: Exact Count */}
        {step === '1b' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-sm text-gray-dark/50 hover:text-navy transition-colors mb-6"
            >
              ← Back
            </button>
            <h1 className="font-heading text-2xl font-bold text-navy mb-2 text-center">
              How many exactly?
            </h1>
            <p className="text-sm text-gray-dark/60 text-center mb-8">
              superLandlord Heavy covers 12. Each additional is €5/yr.
            </p>
            <form onSubmit={handleExactCountSubmit} className="space-y-4">
              <input
                type="number"
                min="13"
                value={exactCount}
                onChange={(e) => setExactCount(e.target.value)}
                placeholder="e.g. 20"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-navy placeholder:text-gray-dark/30 focus:outline-none focus:border-navy text-center text-2xl font-heading font-bold"
                autoFocus
              />
              {exactCountNum > 12 && (
                <p className="text-sm text-center text-gray-dark/60">
                  €99/yr + €{(exactCountNum - 12) * 5}/yr overage ={' '}
                  <span className="font-semibold text-navy">€{99 + (exactCountNum - 12) * 5}/yr total</span>
                </p>
              )}
              <button
                type="submit"
                disabled={!exactCountNum || exactCountNum <= 12}
                className="w-full bg-navy text-white font-heading font-semibold py-3 rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Subscription Pitch */}
        {step === 2 && plan && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-sm text-gray-dark/50 hover:text-navy transition-colors mb-6"
            >
              ← Back
            </button>
            <div className="text-center mb-8">
              <span className="inline-block bg-gold/10 text-gold text-xs font-semibold px-3 py-1 rounded-full mb-3">
                Recommended for you
              </span>
              <h1 className="font-heading text-2xl font-bold text-navy mb-1">{plan.name}</h1>
              <div className="flex items-baseline justify-center gap-1 mt-3">
                <span className="font-heading text-4xl font-bold text-navy">€{totalPrice}</span>
                <span className="text-gray-dark/50 text-sm">/yr</span>
              </div>
              {overage > 0 && (
                <p className="text-xs text-gray-dark/50 mt-1">
                  €99 base + €{overage * 5} overage ({overage} extra {overage === 1 ? 'property' : 'properties'} × €5/yr)
                </p>
              )}
            </div>

            <ul className="space-y-2.5 mb-8">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-gray-dark/70">
                  <span className="w-4 h-4 rounded-full bg-gold/20 text-gold flex items-center justify-center text-xs font-bold shrink-0">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-4">
                {error}
              </p>
            )}

            <button
              onClick={handleProceed}
              disabled={submitting}
              className="w-full bg-gold text-white font-heading font-semibold py-3.5 rounded-xl hover:bg-gold/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Redirecting…' : 'Proceed to payment'}
            </button>
            <p className="text-xs text-center text-gray-dark/40 mt-3">
              Secure checkout via Stripe. Cancel anytime.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
