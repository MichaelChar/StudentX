'use client';

import { Suspense, useEffect, useState } from 'react';
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
  // ?email=<addr> prefill — used by the landlord-signup roleConflict CTA
  // to deep-link a dual-role student straight back to their own login.
  const initialEmail = searchParams.get('email') || '';
  // ?roleConflict=landlord (carried by requireStudent's wrong-role
  // redirect when the auth user has a landlord row) — render a clear
  // banner with a CTA to landlord login instead of silently bouncing.
  const roleConflict = searchParams.get('roleConflict');
  const showLandlordConflict = roleConflict === 'landlord';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // stage: '' | 'auth' | 'redirect' — drives the multi-step button label so
  // the user gets a moving signal instead of a frozen "Signing in…" string.
  const [stage, setStage] = useState('');
  const loading = stage !== '';

  // Warm the Cloudflare Worker isolate while the user is typing. The
  // login POST then doesn't pay cold-start latency on top of the
  // Supabase round-trip. Fire-and-forget; cheap GET, no auth.
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' }).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStage('auth');
    try {
      const supabase = getSupabaseBrowser();
      // PR #138's defence: when a cached browser client has a session
      // whose token refresh is hung, the next signInWithPassword can
      // queue behind the stuck refresh on the same HTTP/2 connection.
      // Clearing first cancels the refresh. getSession() reads from
      // localStorage synchronously, so when there's no prior session we
      // skip the signOut and save a ~200–1000 ms Supabase round-trip —
      // the hung-refresh scenario can only happen when there IS one.
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (existing) {
        await withTimeout(supabase.auth.signOut(), 5000).catch(() => {});
      }

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

          setStage('redirect');

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

            // Idempotent profile probe — ensures a students row exists
            // even if the signup trigger was skipped (e.g. pre-seeded
            // landlord email collision). Returns the existing row when
            // one is already present, so this is a no-op on happy path.
            try {
              const profileRes = await withTimeout(
                fetch('/api/student/profile', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${data.session.access_token}`,
                  },
                  body: JSON.stringify({ preferred_locale: 'en' }),
                }),
              );
              if (profileRes.status === 409) {
                const profileBody = await profileRes.json().catch(() => ({}));
                if (profileBody.conflict_role === 'landlord') {
                  const conflictUrl = new URL(window.location.href);
                  conflictUrl.searchParams.set('roleConflict', 'landlord');
                  if (data.session.user?.email) {
                    conflictUrl.searchParams.set('email', data.session.user.email);
                  }
                  window.location.assign(conflictUrl.toString());
                  return;
                }
              }
            } catch {
              // Best-effort — proceed with redirect.
            }
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
          return;
        } catch (err) {
          lastErr = err;
          if (attempt === 0 && err.message?.includes('timed out')) continue;
          break;
        }
      }
      setError(lastErr?.message || 'Something went wrong. Please try again.');
    } finally {
      setStage('');
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
      {showLandlordConflict && (
        <div className="mb-6 rounded-sm border border-yellow/40 bg-yellow/10 px-4 py-3 text-sm text-night">
          <p className="font-medium">{t('roleConflictLandlordTitle')}</p>
          <p className="mt-1 text-night/70">{t('roleConflictLandlordBody')}</p>
          <Link
            href={{
              pathname: '/property/thessaloniki/landlord/login',
              query: initialEmail ? { email: initialEmail } : {},
            }}
            className="mt-2 inline-block text-blue font-medium hover:text-night"
          >
            {t('roleConflictLandlordCta')} →
          </Link>
        </div>
      )}

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
          animated
          disabled={loading}
          className="w-full justify-center"
        >
          {stage === 'redirect'
            ? t('submittingRedirect')
            : stage === 'auth'
              ? t('submittingAuth')
              : t('submit')}
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
