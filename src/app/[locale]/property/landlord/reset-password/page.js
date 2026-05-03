'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';
import BauhausLoader from '@/components/BauhausLoader';

export default function ResetPasswordPage() {
  const t = useTranslations('landlord.resetPassword');
  const tLoaders = useTranslations('loaders');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(null); // null = waiting, true = ready, false = invalid

  useEffect(() => {
    // Supabase processes the recovery token from the URL hash automatically
    // on session state change; we wait for the PASSWORD_RECOVERY event.
    const supabase = getSupabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // Token was invalid or expired — no recovery event will come
        setReady((prev) => (prev === null ? false : prev));
      }
    });
    // Fallback: if no auth event fires within 5s, treat as invalid link
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
    try {
      const supabase = getSupabaseBrowser();
      const updatePromise = supabase.auth.updateUser({ password });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timed out. Please try again.')),
          15000,
        ),
      );
      const { error: updateError } = await Promise.race([
        updatePromise,
        timeoutPromise,
      ]);

      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell eyebrow="Password reset" title={t('successTitle')} subtitle={t('successMessage')}>
        <p className="text-sm">
          <Link
            href="/property/landlord/login"
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
      <AuthShell eyebrow="Reset password" title={t('title')}>
        <BauhausLoader
          mode="block"
          eyebrow={tLoaders('verifying')}
          statuses={tLoaders.raw('verifyingCycle')}
        />
      </AuthShell>
    );
  }

  if (ready === false) {
    return (
      <AuthShell eyebrow="Reset password" title={t('invalidLinkTitle') || t('title')} subtitle={t('invalidLink')}>
        <p className="text-sm">
          <Link
            href="/property/landlord/forgot-password"
            className="text-blue font-medium hover:text-night"
          >
            {t('requestNewLink')} →
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Reset password" title={t('title')} subtitle={t('subtitle')}>
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
