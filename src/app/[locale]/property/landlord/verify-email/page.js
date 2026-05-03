'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useAuthEmail } from '@/lib/useAuthEmail';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import Button from '@/components/ui/Button';

export default function VerifyEmailPage() {
  const t = useTranslations('landlord.verifyEmail');
  const email = useAuthEmail();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  async function handleResend() {
    setError('');
    setResending(true);

    try {
      if (!email) {
        // Empty string means signed-out (hook resolved). null means
        // still loading — but the disabled prop below blocks click in
        // that state, so this branch only fires for a true sign-out.
        setError(t('noSession'));
        return;
      }

      const supabase = getSupabaseBrowser();
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (resendError) {
        setError(resendError.message);
      } else {
        setResent(true);
      }
    } catch (err) {
      console.error('[landlord/verify-email] resend failed:', err);
      setError(t('noSession'));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell eyebrow="Verify email" title={t('title')} subtitle={t('message')}>
      <div className="space-y-5">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
            {error}
          </p>
        )}

        {resent ? (
          <p className="text-sm text-blue bg-blue/10 border border-blue/20 rounded-sm px-3 py-2">
            {t('resentConfirm')}
          </p>
        ) : (
          <Button
            onClick={handleResend}
            variant="primary"
            disabled={resending || email === null}
            className="w-full justify-center"
          >
            {resending ? t('resending') : t('resend')}
          </Button>
        )}

        <p className="text-sm text-night/60">
          <Link
            href="/property/landlord/login"
            className="text-blue font-medium hover:text-night"
          >
            {t('backToLogin')} →
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
