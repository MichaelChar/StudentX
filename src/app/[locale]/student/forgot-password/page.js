'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';

export default function StudentForgotPasswordPage() {
  const t = useTranslations('student.forgotPassword');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();
    const locale = window.location.pathname.split('/')[1] || 'el';
    const redirectTo = `${window.location.origin}/${locale}/student/reset-password`;
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
      <AuthShell
        eyebrow="Reset link sent"
        title={t('successTitle')}
        subtitle={t('successMessage')}
        portal={t('portal')}
      >
        <p className="text-sm">
          <Link
            href="/student/login"
            className="text-blue font-medium hover:text-night"
          >
            {t('backToLogin')} →
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Forgot password"
      title={t('title')}
      subtitle={t('subtitle')}
      portal={t('portal')}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField
          id="email"
          label={t('emailLabel')}
          type="email"
          required
          value={email}
          onChange={setEmail}
          placeholder={t('emailPlaceholder')}
        />

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          className="w-full justify-center"
        >
          {loading ? t('submitting') : t('submit')}
        </Button>
      </form>

      <p className="mt-8 text-sm text-night/60">
        <Link
          href="/student/login"
          className="text-blue font-medium hover:text-night"
        >
          {t('backToLogin')} →
        </Link>
      </p>
    </AuthShell>
  );
}
