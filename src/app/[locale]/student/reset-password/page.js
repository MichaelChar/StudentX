'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';

export default function StudentResetPasswordPage() {
  const t = useTranslations('student.resetPassword');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        setReady((prev) => (prev === null ? false : prev));
      }
    });
    const timeout = setTimeout(() => {
      setReady((prev) => (prev === null ? false : prev));
    }, 5000);
    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
      <AuthShell
        eyebrow="Password reset"
        title={t('successTitle')}
        subtitle={t('successMessage')}
        portal={t('portal')}
      >
        <p className="text-sm">
          <Link
            href="/student/login"
            className="text-blue font-medium hover:text-night"
          >
            {t('goToLogin')} →
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (ready === null) {
    return (
      <AuthShell eyebrow="Reset password" title={t('title')} portal={t('portal')}>
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      </AuthShell>
    );
  }

  if (ready === false) {
    return (
      <AuthShell
        eyebrow="Reset password"
        title={t('invalidLinkTitle') || t('title')}
        subtitle={t('invalidLink')}
        portal={t('portal')}
      >
        <p className="text-sm">
          <Link
            href="/student/forgot-password"
            className="text-blue font-medium hover:text-night"
          >
            {t('requestNewLink')} →
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Reset password"
      title={t('title')}
      subtitle={t('subtitle')}
      portal={t('portal')}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField
          id="password"
          label={t('passwordLabel')}
          type="password"
          required
          value={password}
          onChange={setPassword}
          placeholder={t('passwordPlaceholder')}
        />

        <FormField
          id="confirm"
          label={t('confirmLabel')}
          type="password"
          required
          value={confirm}
          onChange={setConfirm}
          placeholder={t('confirmPlaceholder')}
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
    </AuthShell>
  );
}
