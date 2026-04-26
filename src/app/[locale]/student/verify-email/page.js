'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import Button from '@/components/ui/Button';

export default function StudentVerifyEmailPage() {
  const t = useTranslations('student.verifyEmail');
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
    <AuthShell
      eyebrow="Verify email"
      title={t('title')}
      subtitle={t('message')}
      portal={t('portal')}
    >
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
            disabled={resending}
            className="w-full justify-center"
          >
            {resending ? t('resending') : t('resend')}
          </Button>
        )}

        <p className="text-sm text-night/60">
          <Link
            href="/student/login"
            className="text-blue font-medium hover:text-night"
          >
            {t('backToLogin')} →
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
