'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

export default function LandlordLoginPage() {
  const t = useTranslations('landlord.login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const { data: landlord } = await supabase
      .from('landlords')
      .select('onboarding_completed')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (!landlord?.onboarding_completed) {
      router.push('/landlord/onboarding');
    } else {
      router.push('/landlord/dashboard');
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold text-navy mb-2 text-center">{t('title')}</h1>
        <p className="text-sm text-gray-dark/60 text-center mb-8">
          {t('subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-dark mb-1">
              {t('emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-dark">
                {t('passwordLabel')}
              </label>
              <Link href="/landlord/forgot-password" className="text-xs text-gold hover:underline">
                {t('forgotPassword')}
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
              placeholder={t('passwordPlaceholder')}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy text-white font-heading font-semibold py-2.5 rounded-lg hover:bg-navy/90 transition-colors disabled:opacity-50"
          >
            {loading ? t('submitting') : t('submit')}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-gray-dark/60">
          {t('noAccount')}{' '}
          <Link href="/landlord/signup" className="text-gold font-medium hover:underline">
            {t('signupLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}
