'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { useTranslations } from 'next-intl';
import { DEFAULT_CITY } from '@/lib/cityRoutes';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';
import OAuthProviders from '@/components/student/OAuthProviders';

function SignInInner() {
  const t = useTranslations('unifiedSignin');
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?next=<encoded path> — set by AuthGate when it pushes a guest to login.
  const nextRaw = searchParams.get('next') || '';
  const safeNext = nextRaw.startsWith('/') ? nextRaw : '';
  // ?email=<addr> prefill — used by role-conflict CTAs in both signup pages.
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [noProfile, setNoProfile] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNoProfile(false);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      // Clear any stale session first — a hung _recoverAndRefresh on the
      // cached browser client can saturate the HTTP/2 connection to Supabase
      // and queue the login POST behind a stuck token-refresh request.
      await supabase.auth.signOut().catch(() => {});

      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
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

          // Detect role via the same endpoint the Navbar uses.
          const meRes = await withTimeout(
            fetch('/api/auth/me', {
              headers: { Authorization: `Bearer ${data.session?.access_token}` },
            }),
          );
          const meJson = meRes.ok ? await meRes.json() : {};
          const role = meJson.user?.role || null;

          if (role === 'student') {
            if (safeNext) {
              window.location.assign(safeNext);
              return;
            }
            router.push('/student/account');
            return;
          }

          if (role === 'landlord') {
            router.push(`/property/${DEFAULT_CITY}/landlord/dashboard`);
            return;
          }

          // Auth succeeded but no student or landlord profile — orphaned account.
          setNoProfile(true);
          await supabase.auth.signOut().catch(() => {});
          return;
        } catch (err) {
          lastErr = err;
          if (attempt === 0 && err.message?.includes('timed out')) continue;
          break;
        }
      }
      setError(lastErr?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
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

        {noProfile && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-3 space-y-2">
            <p>{t('noProfileError')}</p>
            <div className="flex flex-col gap-1">
              <Link href="/student/signup" className="text-blue font-medium hover:text-night">
                {t('studentSignupLink')} →
              </Link>
              <Link
                href={`/property/${DEFAULT_CITY}/landlord/signup`}
                className="text-blue font-medium hover:text-night"
              >
                {t('landlordSignupLink')} →
              </Link>
            </div>
          </div>
        )}

        <Button
          type="submit"
          animated
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

      <div className="mt-8 space-y-2 text-sm text-night/60">
        <p>
          {t('noStudentAccount')}{' '}
          <Link href="/student/signup" className="text-blue font-medium hover:text-night">
            {t('studentSignupLink')} →
          </Link>
        </p>
        <p>
          {t('noLandlordAccount')}{' '}
          <Link
            href={`/property/${DEFAULT_CITY}/landlord/signup`}
            className="text-blue font-medium hover:text-night"
          >
            {t('landlordSignupLink')} →
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function SignInPage() {
  // useSearchParams must be wrapped in Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
