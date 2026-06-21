'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import { safeNextPath } from '@/lib/safeNext';
import { reportLoginTiming } from '@/lib/reportClientError';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import EncryptButton from '@/components/ui/EncryptButton';
import OAuthProviders from '@/components/student/OAuthProviders';

// The first submit since page load pays Worker cold-start latency the most;
// tag the timing beacon (#265) with that so warm vs cold samples separate.
let firstStudentSubmitSinceLoad = true;

function StudentLoginInner() {
  const t = useTranslations('student.login');
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?next=<encoded path> takes priority over the default account
  // redirect — set by AuthGate when it pushes a guest to login.
  const nextRaw = searchParams.get('next') || '';
  const safeNext = safeNextPath(nextRaw);
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
    // Warm the destination RSC payload + route chunks too (#257), so the
    // post-auth navigation is a cache hit instead of a 100–300 ms fetch.
    // safeNext is validated internal-path-only; no-op in `next dev`.
    router.prefetch(safeNext || '/student/account');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStage('auth');

    // Per-stage timing (#265). t0 marks the start; tAuth/tBootstrap are
    // filled as each leg resolves so emit() can report per-stage deltas.
    // Beacon is fire-and-forget (keepalive) and never affects control flow.
    const t0 = performance.now();
    const coldHint = firstStudentSubmitSinceLoad;
    firstStudentSubmitSinceLoad = false;
    let tAuth = 0;
    let tBootstrap = 0;
    let lastAttempt = 0;
    const emit = (extra = {}) =>
      reportLoginTiming({
        flow: 'student',
        attempt: lastAttempt,
        coldHint,
        auth: tAuth ? Math.round(tAuth - t0) : 0,
        bootstrap: tBootstrap && tAuth ? Math.round(tBootstrap - tAuth) : 0,
        total: Math.round(performance.now() - t0),
        ...extra,
      });

    try {
      const supabase = getSupabaseBrowser();
      // PR #138's defence: when a cached browser client has a session whose
      // token refresh is hung, the next signInWithPassword can queue behind
      // the stuck refresh on gotrue's shared auth lock. Clearing first cancels
      // it. Local scope wipes the session WITHOUT a network /logout, so it adds
      // no latency on the sign-in path and only runs when a session exists.
      // If getSession itself contends on the lock, treat that as "a session may
      // exist" and clear anyway.
      let hasStaleSession = false;
      try {
        const { data: { session: existing } } = await supabase.auth.getSession();
        hasStaleSession = Boolean(existing);
      } catch {
        hasStaleSession = true;
      }
      if (hasStaleSession) {
        await signOutSafely(supabase, { scope: 'local' });
      }

      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        lastAttempt = attempt;
        try {
          const { data, error: authError } = await withTimeout(
            // 8 s: healthy legs finish <1 s; with the one timeout-retry this
            // bounds a hung flow at ~16 s instead of ~30 s (#264).
            supabase.auth.signInWithPassword({ email, password }),
            8000,
          );
          tAuth = performance.now();
          if (authError) {
            emit({ error: true, stage: 'auth' });
            setError(authError.message);
            return;
          }

          setStage('redirect');

          // One server-side round-trip (#253): validate the token, provision
          // the students row (idempotent), and set the auth cookie — replacing
          // the old sequential /api/auth/session + /api/student/profile hops.
          if (data.session?.access_token) {
            const bootstrapRes = await withTimeout(
              fetch('/api/auth/bootstrap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: data.session.access_token,
                  role: 'student',
                }),
              }),
              8000,
            );
            tBootstrap = performance.now();

            // 409 → this email is already a landlord. Deep-link back to login
            // with the conflict banner (same UX as the old profile-probe path).
            if (bootstrapRes.status === 409) {
              const bootstrapBody = await bootstrapRes.json().catch(() => ({}));
              if (bootstrapBody.conflict_role === 'landlord') {
                emit({ conflict: 'landlord' });
                const conflictUrl = new URL(window.location.href);
                conflictUrl.searchParams.set('roleConflict', 'landlord');
                if (data.session.user?.email) {
                  conflictUrl.searchParams.set('email', data.session.user.email);
                }
                window.location.assign(conflictUrl.toString());
                return;
              }
            }

            // Any other non-2xx (401 bad token, 500, …): the destination RSC
            // would see a guest and bounce back to login — which reads as "my
            // password didn't work". Surface it instead of looping silently.
            if (!bootstrapRes.ok) {
              emit({ error: true, stage: 'bootstrap' });
              setError(t('sessionError'));
              return;
            }
          }

          emit();
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
      emit({ error: true, stage: 'exception' });
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

        <EncryptButton
          type="submit"
          disabled={loading}
          className="w-full"
          text={
            stage === 'redirect'
              ? t('submittingRedirect')
              : stage === 'auth'
                ? t('submittingAuth')
                : t('submit')
          }
        />
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
