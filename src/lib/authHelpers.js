import { withTimeout } from '@/lib/withTimeout';

/**
 * Sign out without ever blocking the UI. A hung supabase.auth.signOut() (e.g.
 * a stuck token refresh on the same HTTP/2 connection, or a dropped mobile
 * network) is bounded by withTimeout and the rejection is swallowed — sign-out
 * is always best-effort, and callers should proceed (navigate away) regardless
 * of the outcome. Centralised so call sites can't drift back to an unbounded
 * `await supabase.auth.signOut()`.
 */
export async function signOutSafely(supabase, { timeoutMs = 5000 } = {}) {
  await withTimeout(supabase.auth.signOut(), timeoutMs).catch(() => {});
}
