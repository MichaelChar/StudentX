'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';
import OAuthProviders from '@/components/student/OAuthProviders';

function StudentLoginInner() {
  const t = useTranslations('student.login');
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?next=<encoded path> takes priority over the default account
  // redirect — set by AuthGate when it pushes a guest to login.
  const nextRaw = searchParams.get('next') || '';
  const safeNext = nextRaw.startsWith('/') ? nextRaw : '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      // Sync cookie eagerly so the next navigation's RSC sees auth without
      // waiting for SessionSync's onAuthStateChange to fire.
      if (data.session?.access_token) {
        await withTimeout(
          fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: data.session.access_token }),
          }),
        );
      }

      if (safeNext) {
        // useRouter.push with a locale-prefixed path won't accept ?, so we
        // hand a raw URL to window.location for paths that include query
        // strings (the common case when AuthGate threads search/results
        // state back into the next URL).
        window.location.assign(safeNext);
        return;
      }

      router.push('/student/account');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title={t('title')}
      subtitle={t('subtitle')}
      portal={t('portal')}
      brandBlurb={t('brandBlurb')}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField
          label={t('emailLabel')}
          id="email"
          type="email"
          required
          value={email}
          onChange={setEmail}
          placeholder={t('emailPlaceholder')}
        />

        <FormField
          label={t('passwordLabel')}
          id="password"
          type="password"
          required
          value={password}
          onChange={setPassword}
          placeholder={t('passwordPlaceholder')}
          rightAction={
            <Link
              href="/student/forgot-password"
              className="label-caps text-blue hover:text-night"
            >
              {t('forgotPassword')}
            </Link>
          }
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

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-night/10" />
        <span className="label-caps text-night/40">{t('or')}</span>
        <span className="h-px flex-1 bg-night/10" />
      </div>

      <OAuthProviders context="login" />

      <p className="mt-8 text-sm text-night/60">
        {t('noAccount')}{' '}
        <Link
          href="/student/signup"
          className="text-blue font-medium hover:text-night"
        >
          {t('signupLink')} →
        </Link>
      </p>
    </AuthShell>
  );
}

export default function StudentLoginPage() {
  // useSearchParams must be wrapped in Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <StudentLoginInner />
    </Suspense>
  );
}
