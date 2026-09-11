'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

/*
  Hard ceiling on resolving a session, independent of the lock-acquire bound
  in supabaseBrowser.js. That one caps how long we wait to ACQUIRE gotrue's
  mutex; this caps the whole operation, including work done once the lock is
  held. A hung network call inside the lock would otherwise never settle.

  Comfortably longer than the 5s acquire bound so a slow-but-working acquire
  is not cut short — this is a backstop against "never", not a latency budget.
*/
const SESSION_RESOLVE_TIMEOUT_MS = 8000;

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not settle in ${SESSION_RESOLVE_TIMEOUT_MS}ms`)),
      SESSION_RESOLVE_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Resolve an access token from a Supabase client, or '' if it cannot.
 *
 * Extracted from the hook so the failure modes in #521 are unit-testable
 * without a DOM: everything interesting here is async control flow, and
 * pulling in a React testing stack to exercise it would be a dependency
 * decision rather than a test.
 *
 * ALWAYS resolves to a string — never rejects, never hangs. That is the
 * whole contract. See the catch block for why.
 *
 * @param {{ auth: { getSession: Function, refreshSession: Function } }} supabase
 * @returns {Promise<string>} the token, or '' when none could be resolved
 */
export async function resolveAccessToken(supabase) {
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 'getSession');
    let session = data?.session ?? null;

    if (!session?.access_token) {
      // Cached session missing or expired (e.g. tab idle for hours). Force a
      // refresh so consumers don't fire requests with a stale token and get
      // 401s before autoRefreshToken catches up.
      const { data: refreshed } = await withTimeout(
        supabase.auth.refreshSession(),
        'refreshSession',
      );
      session = refreshed?.session ?? null;
    }
    return session?.access_token ?? '';
  } catch (err) {
    /*
      Swallow and return '' — issue #521.

      The caller had NO try/catch, and that was the bug. gotrue serialises
      every auth call behind one Navigator lock; boundedAuthLock caps
      ACQUISITION at 5s and THROWS on timeout. An unhandled rejection meant
      setToken() was never called, so the hook stayed at null — which is its
      "still resolving" value. Every consumer then waited forever on a promise
      that had already failed. That is what left the student booking detail
      and landlord reservation detail rendering their heading and nothing
      else, intermittently, under auth contention.

      '' here is deliberately NOT a claim that the user is signed out — it is
      "this client could not resolve a session". onAuthStateChange corrects it
      the moment gotrue emits one, and consumers can show an error and a retry
      instead of hanging.
    */
    console.warn('[useAccessToken] session did not resolve:', err?.message || err);
    return '';
  }
}

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
/*
  One in-flight resolution shared by every mounted consumer.

  There are 13 useAccessToken consumers, and several mount together — an
  account page has FavoritesProvider, GigFavoritesProvider and the page's own
  component at minimum. Each was independently calling getSession(), and
  gotrue serialises all of them behind ONE Navigator lock. The observed
  symptom was five simultaneous "getSession did not settle in 8000ms"
  warnings: one operation wedges the lock and every sibling queues behind it
  until it times out.

  Sharing the promise turns N lock operations per page into one. It does not
  fix a wedge that happens anyway, but it removes the pile-up that makes a
  single slow acquire fan out into every component on the page.

  Cleared on settle, so a later mount re-resolves rather than reusing a stale
  answer. Deliberately NOT inside resolveAccessToken: that stays pure so the
  unit tests can pass it different mock clients without sharing state.
*/
let sharedResolve = null;

function sharedResolveAccessToken(supabase) {
  if (!sharedResolve) {
    sharedResolve = resolveAccessToken(supabase).finally(() => {
      sharedResolve = null;
    });
  }
  return sharedResolve;
}

export function useAccessToken() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;
    // Set once a REAL token arrives from either source, so the timeout
    // fallback below can never overwrite a session we already have.
    let haveToken = false;

    /*
      Resolve first, then subscribe — the ordering this has always had.

      I tried subscribing first, on the theory that INITIAL_SESSION would
      deliver the session without touching the call that hangs. It did not
      help (and measured slightly worse, though four runs either way is
      noise). Reverted rather than kept on a hunch.

      What IS kept is `haveToken`: the 8s fallback must never overwrite a
      token the subscription has already delivered. The first version of this
      fix had exactly that bug — a good token at t=1s replaced by '' at t=8s.
    */
    (async () => {
      const next = await sharedResolveAccessToken(supabase);
      if (cancelled || haveToken) return;
      setToken(next);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (cancelled) return;
      if (session?.access_token) {
        haveToken = true;
        setToken(session.access_token);
      } else if (!haveToken) {
        setToken('');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return token;
}
