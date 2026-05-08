'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

/**
 * Resolve the current access token at mount and keep it fresh via
 * onAuthStateChange. Use this in client components instead of calling
 * supabase.auth.getSession() inside a click/submit handler — that
 * pattern can deadlock on the navigator.locks-backed auth storage if
 * a prior auth op didn't release.
 *
 * Returns null until the first session load resolves, then the token
 * (string) or '' if signed out.
 */
export function useAccessToken() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;

    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // Cached session is missing or expired (e.g. tab idle for hours).
        // Force a refresh so consumers don't fire requests with a stale
        // token and get 401s before autoRefreshToken catches up.
        const { data } = await supabase.auth.refreshSession();
        session = data?.session;
      }
      if (!cancelled) setToken(session?.access_token ?? '');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!cancelled) setToken(session?.access_token ?? '');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return token;
}
