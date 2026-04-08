'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

export default function VerifyEmailPage() {
  const t = useTranslations('landlord.verifyEmail');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  async function handleResend() {
    setError('');
    setResending(true);

    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;

    if (!email) {
      setError(t('noSession'));
      setResending(false);
      return;
    }

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    setResending(false);
    if (resendError) {
      setError(resendError.message);
    } else {
      setResent(true);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 text-4xl">✉️</div>
        <h1 className="font-heading text-2xl font-bold text-navy mb-2">{t('title')}</h1>
        <p className="text-sm text-gray-dark/60 mb-8">{t('message')}</p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {resent ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-4">
            {t('resentConfirm')}
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full bg-navy text-white font-heading font-semibold py-2.5 rounded-lg hover:bg-navy/90 transition-colors disabled:opacity-50 mb-4"
          >
            {resending ? t('resending') : t('resend')}
          </button>
        )}

        <p className="text-sm text-gray-dark/60">
          <Link href="/landlord/login" className="text-gold font-medium hover:underline">
            {t('backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
