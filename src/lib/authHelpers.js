import { withTimeout } from '@/lib/withTimeout';
import { reportClientError } from '@/lib/reportClientError';

/**
 * Sign out without ever blocking the UI. A hung supabase.auth.signOut() (e.g.
 * a stuck token refresh on the same HTTP/2 connection, or a dropped mobile
 * network) is bounded by withTimeout and the rejection is swallowed — sign-out
 * is always best-effort, and callers should proceed (navigate away) regardless
 * of the outcome. Centralised so call sites can't drift back to an unbounded
 * `await supabase.auth.signOut()`.
 *
 * The swallowed failure is still beaconed to /api/log-client-error (#143) so
 * the timeout/rejection is visible in logs — this is the class of silent
 * failure behind the original "stuck on SIGNING IN…" bug.
 *
 * `scope` mirrors supabase.auth.signOut's option. Default 'global' revokes the
 * refresh token server-side (the right choice for an explicit "sign out"
 * button). Pass `scope: 'local'` for the pre-sign-in housekeeping clear in the
 * login pages: it wipes the stale browser session WITHOUT a network /logout
 * round-trip, so it can't add latency or hang on the critical sign-in path.
 */
export async function signOutSafely(supabase, { timeoutMs = 5000, scope = 'global' } = {}) {
  await withTimeout(supabase.auth.signOut({ scope }), timeoutMs).catch((err) => {
    reportClientError('signOut', err);
  });
}
