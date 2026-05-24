'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
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
  const showStudentConflict = roleConflict === 'student';
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
          const { error: authError } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
          );
          if (authError) {
            setError(authError.message);
            return;
          }
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
      {showStudentConflict && (
        <div className="mb-6 rounded-sm border border-yellow/40 bg-yellow/10 px-4 py-3 text-sm text-night">
          <p className="font-medium">{t('roleConflictStudentTitle')}</p>
          <p className="mt-1 text-night/70">{t('roleConflictStudentBody')}</p>
          <Link
            href={{
              pathname: '/student/login',
              query: initialEmail ? { email: initialEmail } : {},
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
