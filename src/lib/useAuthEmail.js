'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

/**
 * Resolve the current signed-in email at mount and keep it fresh via
 * onAuthStateChange. Sibling to useAccessToken — same shape, different
 * field. Use this in click/submit handlers that need session.user.email
 * (e.g. resending the verification email) instead of awaiting
 * supabase.auth.getSession() inside the handler — that pattern can
 * deadlock on the navigator.locks-backed auth storage if a prior auth
 * op didn't release.
 *
 * Returns null until the first session load resolves, then the email
 * (string) or '' if signed out.
 */
export function useAuthEmail() {
  const [email, setEmail] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setEmail(session?.user?.email ?? '');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!cancelled) setEmail(session?.user?.email ?? '');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return email;
}
