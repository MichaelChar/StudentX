'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter as useNativeRouter } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import { safeNextPath } from '@/lib/safeNext';
import { reportLoginTiming } from '@/lib/reportClientError';
import { postLoginDestination, STUDENT_HOME, LANDLORD_HOME } from '@/lib/postLoginDestination';
import { useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';
import OAuthProviders from '@/components/student/OAuthProviders';

/*
  /login — ONE sign-in page for students and landlords.

  There used to be two (/student/login and /property/[city]/landlord/login),
  and a user on the wrong one hit a "this email is a landlord / student"
  banner and had to sign in again somewhere else. Supabase auth was always
  role-agnostic, so the split bought nothing but that drop-off. Now the page
  signs in, /api/auth/bootstrap works out which account this is, and the user
  is sent to their own home. The old URLs 301 here (next.config.mjs).

  One email is still one role (migration 036) — this changes which door you
  use, not what an account can be.
*/

// The first submit since page load pays Worker cold-start latency the most;
// tag the timing beacon (#265) with that so warm vs cold samples separate.
let firstSubmitSinceLoad = true;

function LoginInner() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  // Plain next/navigation router — used for ?next= redirects, which may carry
  // a query string the i18n wrapper's push rejects (#258).
  const nativeRouter = useNativeRouter();
  const searchParams = useSearchParams();
  // ?next=<encoded path> — set by AuthGate, the favourites gates, BookingWidget
  // and the server guards when they send a guest here.
  const safeNext = safeNextPath(searchParams.get('next') || '');
  // ?email=<addr> prefill — carried by the wrong-role redirects.
  const initialEmail = searchParams.get('email') || '';
  // ?roleConflict=… is set by a server guard when a SIGNED-IN user opened the
  // other role's area (requireStudent / requireLandlord → wrong-role):
  //   landlord        — a landlord on a student page
  //   student         — a student on a landlord page
  //   landlord-orphan — an unclaimed landlord row waits for this email (#148);
  //                     signing in here claims it (bootstrap → landlord-incomplete)
  const roleConflict = searchParams.get('roleConflict');

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // stage: '' | 'auth' | 'redirect' — drives the multi-step button label so
  // the user gets a moving signal instead of a frozen "Signing in…" string.
  const [stage, setStage] = useState('');
  const loading = stage !== '';

  // Warm the Cloudflare Worker isolate while the user is typing, so the login
  // POST doesn't pay cold-start latency on top of the Supabase round-trip. Also
  // warm both possible destinations (#257) — the role isn't known until after
  // sign-in. No-op in `next dev`.
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' }).catch(() => {});
    if (safeNext) router.prefetch(safeNext);
    router.prefetch(STUDENT_HOME);
    router.prefetch(LANDLORD_HOME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An account with no landlords row yet (bootstrap said landlord-incomplete):
  // create or claim it before entering the dashboard, which would otherwise
  // bounce them straight back here. POST /api/landlord/profile is idempotent —
  // it returns an existing row, links an unclaimed one, or inserts.
  // Returns an error message key, or null on success.
  async function completeLandlordProfile(session) {
    try {
      const res = await withTimeout(
        fetch('/api/landlord/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          // Name captured at signup (user_metadata.display_name). Absent for
          // accounts created before the unified signup — the route then falls
          // back to the email prefix, editable later in Settings.
          body: JSON.stringify({ name: session.user?.user_metadata?.display_name || '' }),
        }),
        8000,
      );
      if (res.ok) return null;
      // 403 = link_orphan_landlord refused because the email is unconfirmed
      // (migration 112).
      return res.status === 403 ? 'landlordSetupUnconfirmed' : 'landlordSetupFailed';
    } catch {
      return 'landlordSetupFailed';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStage('auth');

    // Per-stage timing (#265). t0 marks the start; tAuth/tBootstrap are
    // filled as each leg resolves so emit() can report per-stage deltas.
    // Beacon is fire-and-forget (keepalive) and never affects control flow.
    const t0 = performance.now();
    const coldHint = firstSubmitSinceLoad;
    firstSubmitSinceLoad = false;
    let tAuth = 0;
    let tBootstrap = 0;
    let lastAttempt = 0;
    const emit = (extra = {}) =>
      reportLoginTiming({
        flow: 'unified',
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

          const session = data.session;
          if (!session?.access_token) {
            emit({ error: true, stage: 'auth' });
            setError(t('sessionError'));
            return;
          }

          // One server-side round-trip (#253): validate the token, detect the
          // role and set the auth cookie BEFORE navigation, so the destination
          // server-renders signed in (#254).
          const bootstrapRes = await withTimeout(
            fetch('/api/auth/bootstrap', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: session.access_token }),
            }),
            8000,
          );
          tBootstrap = performance.now();

          // Non-2xx (401 bad token, 503 probe failure, 500): the destination
          // would see a guest and bounce back here — which reads as "my
          // password didn't work". Surface it instead of looping silently.
          if (!bootstrapRes.ok) {
            emit({ error: true, stage: 'bootstrap' });
            await signOutSafely(supabase, { scope: 'local' });
            setError(t('sessionError'));
            return;
          }
          const { role: detected } = await bootstrapRes.json().catch(() => ({}));

          let role = detected;
          if (role === 'landlord-incomplete') {
            const failureKey = await completeLandlordProfile(session);
            if (failureKey) {
              emit({ error: true, stage: 'landlord-profile', role });
              await signOutSafely(supabase);
              setError(t(failureKey));
              return;
            }
            role = 'landlord';
          }

          setStage('redirect');
          emit({ role });
          const destination = postLoginDestination(role === 'landlord' ? 'landlord' : 'student', safeNext);
          if (destination === safeNext) {
            // Client-side navigation (#258) reuses the JS already in memory;
            // the native router accepts the query strings the i18n one rejects.
            nativeRouter.push(destination);
          } else {
            router.push(destination);
          }
          return;
        } catch (err) {
          lastErr = err;
          if (attempt === 0 && err.message?.includes('timed out')) continue;
          break;
        }
      }
      emit({ error: true, stage: 'exception' });
      setError(lastErr?.message || t('genericError'));
    } finally {
      setStage('');
    }
  }

  return (
    <AuthShell eyebrow="Sign in" title={t('title')} subtitle={t('subtitle')}>
      <RoleConflictBanner t={t} roleConflict={roleConflict} />

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
            // Password reset is role-agnostic at the auth layer; the student
            // flow's pages are the generic ones.
            <Link
              href="/student/forgot-password"
              className="label-caps text-blue hover:text-night"
            >
              {t('forgotPassword')}
            </Link>
          }
        />

        {error && (
          <p className="text-sm text-magenta bg-parchment border border-night/10 rounded-control px-3 py-2">
            {error}
          </p>
        )}

        <Button variant="primary" type="submit" disabled={loading} className="w-full">
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
          href={safeNext ? { pathname: '/signup', query: { next: safeNext } } : '/signup'}
          className="text-blue font-medium hover:text-night"
        >
          {t('signupLink')} →
        </Link>
      </p>
    </AuthShell>
  );
}

// Shown when a server guard sent an already-signed-in user here because the
// page they opened belongs to the other role. The form below still works —
// signing in with another email replaces the session.
function RoleConflictBanner({ t, roleConflict }) {
  let title;
  let body;
  let cta = null;
  if (roleConflict === 'landlord') {
    title = t('signedInAsLandlordTitle');
    body = t('signedInAsLandlordBody');
    cta = { href: LANDLORD_HOME, label: t('signedInAsLandlordCta') };
  } else if (roleConflict === 'student') {
    title = t('signedInAsStudentTitle');
    body = t('signedInAsStudentBody');
    cta = { href: STUDENT_HOME, label: t('signedInAsStudentCta') };
  } else if (roleConflict === 'landlord-orphan') {
    title = t('landlordOrphanTitle');
    body = t('landlordOrphanBody');
  } else {
    return null;
  }

  return (
    <div className="mb-6 rounded-card border border-yellow/40 bg-yellow/10 px-4 py-3 text-sm text-night">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-night/70">{body}</p>
      {cta && (
        <Link href={cta.href} className="mt-2 inline-block text-blue font-medium hover:text-night">
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams must be wrapped in Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
