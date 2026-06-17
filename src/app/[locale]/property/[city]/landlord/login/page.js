'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import { reportLoginTiming } from '@/lib/reportClientError';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import EncryptButton from '@/components/ui/EncryptButton';

// The first submit since page load pays Worker cold-start latency the most;
// tag the timing beacon (#265) with that so warm vs cold samples separate.
let firstLandlordSubmitSinceLoad = true;

function LandlordLoginInner() {
  const t = useTranslations('landlord.login');
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?email=<addr> prefill — used by the student-signup roleConflict CTA
  // to deep-link a dual-role landlord straight back to their own login.
  const initialEmail = searchParams.get('email') || '';
  // ?roleConflict=student (carried by requireLandlord's wrong-role
  // redirect when the auth user has a students row) — render a banner
  // with a CTA to student login instead of silently bouncing.
  const roleConflict = searchParams.get('roleConflict');
  // Shown when a non-landlord (e.g. a student) signs in here. Seeded from the
  // ?roleConflict=student redirect requireLandlord emits on server-guarded
  // pages, and also set by the post-auth role probe in handleSubmit below.
  const [studentConflict, setStudentConflict] = useState(roleConflict === 'student');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // stage: '' | 'auth' | 'redirect' — drives the multi-step button label so
  // the user gets a moving signal instead of a frozen "Logging in…" string.
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

    // Per-stage timing (#265). t0 marks the start; tAuth/tBootstrap are filled
    // as each leg resolves so emit() can report per-stage deltas. Beacon is
    // fire-and-forget (keepalive) and never affects control flow.
    const t0 = performance.now();
    const coldHint = firstLandlordSubmitSinceLoad;
    firstLandlordSubmitSinceLoad = false;
    let tAuth = 0;
    let tBootstrap = 0;
    let lastAttempt = 0;
    const emit = (extra = {}) =>
      reportLoginTiming({
        flow: 'landlord',
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

          // Supabase auth is role-agnostic — it accepts any valid credentials,
          // a student's included. Confirm this account is actually a landlord
          // before entering the landlord area; otherwise sign back out and tell
          // them their email is a student account (one role per email). Stage
          // stays 'auth' through the probe so the button doesn't flash
          // "redirecting" when it's actually about to show the conflict banner.
          const token = data.session?.access_token;
          // One server-side round-trip (#253): bootstrap validates the token,
          // confirms the role, and — for a real landlord — sets the auth cookie
          // BEFORE navigation. That eager cookie is what lets the dashboard
          // server-render instead of gating on a client probe (#254).
          let bootstrap = null;
          if (token) {
            try {
              const bootstrapRes = await withTimeout(
                fetch('/api/auth/bootstrap', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ access_token: token, role: 'landlord' }),
                }),
                8000,
              );
              bootstrap = {
                status: bootstrapRes.status,
                body:
                  bootstrapRes.status === 409
                    ? await bootstrapRes.json().catch(() => ({}))
                    : null,
              };
            } catch {
              /* transient bootstrap failure shouldn't block a real landlord */
            }
          }
          tBootstrap = performance.now();

          // 409 student-conflict → sign out and show the banner. Stage stays
          // 'auth' so the button doesn't flash "redirecting".
          if (bootstrap?.status === 409 && bootstrap.body?.conflict_role === 'student') {
            emit({ conflict: 'student' });
            await signOutSafely(supabase);
            setStudentConflict(true);
            return;
          }

          // 200, a null orphan, or a transient/5xx bootstrap failure: proceed.
          // The dashboard's server-side requireLandlord guard bounces bad
          // sessions, so a failed probe needn't block a real landlord.
          emit();
          setStage('redirect');
          router.push('/property/thessaloniki/landlord/dashboard');
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
    <AuthShell eyebrow="Sign in" title={t('title')} subtitle={t('subtitle')}>
      {studentConflict && (
        <div className="mb-6 rounded-sm border border-yellow/40 bg-yellow/10 px-4 py-3 text-sm text-night">
          <p className="font-medium">{t('roleConflictStudentTitle')}</p>
          <p className="mt-1 text-night/70">{t('roleConflictStudentBody')}</p>
          <Link
            href={{
              pathname: '/student/login',
              query: email ? { email } : {},
            }}
            className="mt-2 inline-block text-blue font-medium hover:text-night"
          >
            {t('roleConflictStudentCta')} →
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
              href="/property/thessaloniki/landlord/forgot-password"
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

      <p className="mt-8 text-sm text-night/60">
        {t('noAccount')}{' '}
        <Link
          href="/property/thessaloniki/landlord/signup"
          className="text-blue font-medium hover:text-night"
        >
          {t('signupLink')} →
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LandlordLoginPage() {
  // useSearchParams must be wrapped in Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <LandlordLoginInner />
    </Suspense>
  );
}
