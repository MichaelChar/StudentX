'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('landlord.forgotPassword');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();
    // Use current locale path directly so the recovery hash isn't lost on server redirect
    const locale = window.location.pathname.split('/')[1] || 'el';
    const redirectTo = `${window.location.origin}/${locale}/landlord/reset-password`;
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 text-4xl">✉️</div>
          <h1 className="font-heading text-2xl font-bold text-navy mb-2">{t('successTitle')}</h1>
          <p className="text-sm text-gray-dark/60 mb-8">{t('successMessage')}</p>
          <Link href="/landlord/login" className="text-gold font-medium hover:underline text-sm">
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold text-navy mb-2 text-center">{t('title')}</h1>
        <p className="text-sm text-gray-dark/60 text-center mb-8">{t('subtitle')}</p>

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

        <p className="mt-6 text-sm text-center">
          <Link href="/landlord/login" className="text-gold font-medium hover:underline">
            {t('backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
