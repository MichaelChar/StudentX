'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import AuthShell from '@/components/landlord/AuthShell';
import Button from '@/components/ui/Button';

function StudentOAuthCallbackInner() {
  const t = useTranslations('student.oauth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get('next') || '';
  const safeNext = nextRaw.startsWith('/') ? nextRaw : '';

  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      const supabase = getSupabaseBrowser();
      // Supabase parses the OAuth fragment on first getSession() call
      // when persistSession is on. If the user denied consent, no
      // session lands here and we surface the cancelled-flow error.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError) {
        setError(sessionError.message || t('errorGeneric'));
        return;
      }
      const session = data?.session;
      if (!session?.access_token) {
        setError(t('errorNoSession'));
        return;
      }

      // Eager cookie sync — mirror the login page so the next
      // navigation's RSC sees auth without waiting for SessionSync's
      // onAuthStateChange to fire.
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session.access_token }),
      });

      // Idempotent profile probe — create_student_profile RPC
      // returns the existing row when one is already present (the
      // trigger from migration 029/030 typically beats us to it).
      // Treat a 5xx here as non-fatal: the trigger already ran on
      // signup, so we can still navigate the user onward and let
      // them retry from the account page if anything is missing.
      try {
        await fetch('/api/student/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ preferred_locale: locale }),
        });
      } catch {
        // Network blip — proceed anyway; account page will surface
        // any real provisioning failure on its own load.
      }

      if (cancelled) return;

      if (safeNext) {
        // Use window.location for query-string-bearing paths;
        // useRouter.push refuses them with locale-prefixed routing.
        window.location.assign(safeNext);
        return;
      }
      router.push('/student/account');
    }

    complete();
    return () => {
      cancelled = true;
    };
    // Run once on mount — locale/safeNext are stable per redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell
      eyebrow="Sign in"
      title={error ? t('errorTitle') : t('callbackLoading')}
      subtitle={error || ''}
      portal={t('portal')}
    >
      <div className="space-y-5">
        {error ? (
          <Button
            href="/student/login"
            variant="primary"
            className="w-full justify-center"
          >
            {t('tryAgain')}
          </Button>
        ) : (
          <div className="flex items-center gap-3 text-sm text-night/60">
            <span
              aria-hidden="true"
              className="h-4 w-4 rounded-full border-2 border-night/20 border-t-night animate-spin"
            />
            <span>{t('callbackLoading')}</span>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

export default function StudentOAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <StudentOAuthCallbackInner />
    </Suspense>
  );
}
