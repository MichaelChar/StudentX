'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import EncryptButton from '@/components/ui/EncryptButton';

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
        try {
          const { data, error: authError } = await withTimeout(
            // 8 s: healthy legs finish <1 s; with the one timeout-retry this
            // bounds a hung flow at ~16 s instead of ~30 s (#264).
            supabase.auth.signInWithPassword({ email, password }),
            8000,
          );
          if (authError) {
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
          let role = 'landlord'; // unknown probe → defer to the dashboard's own guards
          if (token) {
            try {
              const meRes = await withTimeout(
                fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
                8000,
              );
              if (meRes.ok) {
                const { user } = await meRes.json();
                role = user?.role ?? null;
              }
            } catch {
              /* transient probe failure shouldn't block a real landlord */
            }
          }

          if (role === 'student') {
            await signOutSafely(supabase);
            setStudentConflict(true);
            return;
          }

          // role 'landlord', or a null orphan / probe-unavailable: proceed. A
          // null orphan is bounced safely by the dashboard's server-side
          // requireLandlord guard, so it needn't be special-cased here.
          setStage('redirect');
          router.push('/property/thessaloniki/landlord/dashboard');
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
