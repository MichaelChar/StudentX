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
 * Because there is no lockfile in this repo (each deploy resolves `@supabase/*`
 * to "latest matching"), pinning the bound in our own code keeps it guaranteed
 * across version drift. On a recent auth-js — whose default is already 5 s with
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
