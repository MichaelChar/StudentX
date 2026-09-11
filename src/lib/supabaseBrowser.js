import { createClient, navigatorLock } from '@supabase/supabase-js';

let _client;

// Hard ceiling (ms) on how long any auth call will wait to ACQUIRE gotrue's
// shared lock. See the comment on boundedAuthLock for why this exists.
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;

/**
 * Bounded wrapper around gotrue-js's own Navigator-locks mutex.
 *
 * gotrue serialises every auth operation (signInWithPassword, getSession,
 * signOut, the background token refresh) behind one cross-tab lock. Its
 * acquire timeout (`lockAcquireTimeout`) is NOT configurable through
 * supabase-js's `createClient` — only the `lock` function itself is forwarded
 * — and on some auth-js builds the default acquire waits forever. The failure
 * that bit us in prod: an auto-refresh fired on page load wedged the lock, and
 * the user's next sign-in queued behind it. Sign-in froze for ~2 minutes while
 * Supabase + the Worker were each responding in <1 s — the stall was entirely
 * client-side lock contention.
 *
 * This delegates to the library's own `navigatorLock` (so we keep its
 * orphaned-lock steal-recovery and the spec edge cases) but forces a finite
 * acquire bound. A wedged lock now fails fast / self-heals instead of hanging.
 * (The comment here used to say there was no lockfile in this repo. There is —
 * package-lock.json is committed — and as of #521 `@supabase/supabase-js` is
 * also pinned exactly, because three versions were measured and all wedge the
 * same way. Keeping the bound in our own code is still worth it: it is one
 * fewer thing that changes meaning on an upgrade.) On a recent auth-js — whose default is already 5 s with
 * steal-recovery — this is effectively a no-op.
 */
function boundedAuthLock(name, acquireTimeout, fn) {
  // No Web Locks API (older browser / non-browser import) or the export went
  // away in a future major: match gotrue's own no-op-lock fallback.
  if (
    typeof navigator === 'undefined' ||
    !navigator.locks ||
    typeof navigatorLock !== 'function'
  ) {
    return fn();
  }
  // gotrue passes `acquireTimeout === 0` for the background-refresh tick
  // ("take the lock only if free right now") — preserve that fast path.
  // Everything else is capped at our finite bound.
  const bound = acquireTimeout === 0 ? 0 : LOCK_ACQUIRE_TIMEOUT_MS;
  return navigatorLock(name, bound, fn);
}

/*
  Read the persisted session straight out of storage, bypassing gotrue.

  WHY THIS EXISTS (#521). getSession() takes the `sb-<ref>-auth-token`
  Navigator lock. We reproduced a holder that takes that lock and NEVER
  releases it — three samples over 6.5s showed the same client holding it
  with nothing pending, while every caller timed out. Pinning did not help:
  supabase-js 2.95.0, 2.101.0 and 2.105.0 all behave the same.

  The read path does not need the lock. gotrue serialises because a refresh
  may WRITE; simply reading an unexpired token is safe to do directly, and
  removes the hot path from behind a mutex that can wedge.

  DELIBERATELY CONSERVATIVE. This depends on supabase's storage format, which
  is exactly the kind of thing that changes silently on upgrade. So every
  deviation — missing key, unparseable JSON, wrong shape, expired, missing
  expiry — returns null and the caller falls back to getSession() as before.
  A format change degrades to today's behaviour rather than breaking auth.

  EXPIRY IS REQUIRED, not optional: a token with no readable expiry is
  treated as unusable. Returning a possibly-expired token would trade a
  hang for silent 401s, which is worse — at least a hang is visible.
*/
const EXPIRY_SKEW_SECONDS = 60;

export function readPersistedSession() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;

    // Matches supabase-js's default storageKey: sb-<project-ref>-auth-token.
    const ref = new URL(url).hostname.split('.')[0];
    const raw = window.localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const token = parsed?.access_token;
    const expiresAt = parsed?.expires_at;
    if (typeof token !== 'string' || !token) return null;
    if (typeof expiresAt !== 'number') return null;

    // Refresh slightly early so we never hand out a token about to expire.
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt - EXPIRY_SKEW_SECONDS <= now) return null;

    return token;
  } catch {
    return null;
  }
}

/**
 * Browser-side Supabase client with session persistence.
 * Safe to call in client components and useEffect hooks.
 */
export function getSupabaseBrowser() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    _client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Bound lock acquisition so a wedged auth op can't freeze sign-in.
        lock: boundedAuthLock,
      },
    });
  }
  return _client;
}
