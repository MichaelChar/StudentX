'use client';

import { useEffect } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

// Mirrors the browser-side Supabase session into the sb-access-token cookie
// so RSCs (notably the listing detail page guard) can read auth state on
// the server. Runs once at the top of the locale layout. Idempotent: if
// the cookie is already in sync it just rewrites the same value, which is
// cheap.
//
// Auto-refresh: the Supabase browser client refreshes tokens before they
// expire (autoRefreshToken: true) and emits a TOKEN_REFRESHED event on
// onAuthStateChange. We re-POST the new token so the cookie keeps up
// with rotation, otherwise server-side auth would fail an hour after
// sign-in even though the client still believes it's signed in.
//
// Dedupe (#259): the initial-sync IIFE and the SIGNED_IN event both POST,
// and a fresh login has already synced the cookie itself — so the same token
// was being POSTed up to several times, each a wasted Worker invocation + JWT
// verify. Track the last successfully-synced token at module scope (survives
// re-renders; resets on a full page load, which is exactly when the cookie
// might genuinely be stale) and skip duplicates. A token refresh rotates the
// access token (~hourly) → new string → the POST goes through, so the cookie
// still keeps up with rotation.
let lastSyncedToken = null;

export default function SessionSync() {
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;

    async function postSession(accessToken) {
      if (accessToken === lastSyncedToken) return; // already synced this token
      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken }),
        });
        // Only remember it on success — a failed sync must stay retryable.
        if (res.ok) lastSyncedToken = accessToken;
      } catch {
        // Best-effort — the next state change will retry (token not recorded).
      }
    }

    async function clearSession() {
      lastSyncedToken = null; // sign-out must always re-sync next time
      try {
        await fetch('/api/auth/session', { method: 'DELETE' });
      } catch {}
    }

    // Initial sync — handles the case where the user already has a
    // localStorage session from a previous tab (no SIGNED_IN event will
    // fire on this navigation) but the cookie is missing or stale.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await postSession(session.access_token);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearSession();
        return;
      }
      if (session?.access_token) {
        postSession(session.access_token);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
