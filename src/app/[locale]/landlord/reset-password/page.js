'use client';

import { useState, useEffect } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

export default function ResetPasswordPage() {
  const t = useTranslations('landlord.resetPassword');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase processes the recovery token from the URL hash automatically
    // on session state change; we wait for the PASSWORD_RECOVERY event.
    const supabase = getSupabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('passwordMismatch'));
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 text-4xl">✅</div>
          <h1 className="font-heading text-2xl font-bold text-navy mb-2">{t('successTitle')}</h1>
          <p className="text-sm text-gray-dark/60 mb-8">{t('successMessage')}</p>
          <Link href="/landlord/login" className="text-gold font-medium hover:underline text-sm">
            {t('goToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-gray-dark/60 mb-4">{t('invalidLink')}</p>
          <Link href="/landlord/forgot-password" className="text-gold font-medium hover:underline text-sm">
            {t('requestNewLink')}
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
            <label htmlFor="password" className="block text-sm font-medium text-gray-dark mb-1">
              {t('passwordLabel')}
            </label>
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

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-dark mb-1">
              {t('confirmLabel')}
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
              placeholder={t('confirmPlaceholder')}
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
      </div>
    </div>
  );
}
