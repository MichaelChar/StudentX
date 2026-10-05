/*
  Subscribe to Supabase auth changes with a handler that may call back into
  supabase.auth (getSession, getUser, refreshSession, …).

  WHY NOT supabase.auth.onAuthStateChange DIRECTLY. gotrue runs every auth
  operation behind one lock and notifies listeners from INSIDE it:
  signOut() takes the lock, removes the session, then awaits every listener
  before releasing. A listener that awaits getSession() queues behind the very
  signOut that is waiting for it — a deadlock that only breaks when the
  listener's own timeout fires. Navbar's did exactly this: every sign-out held
  the lock for its 15 s withTimeout, and any sign-in in that window queued
  behind it (measured 30 s for sign-out → sign-in in one tab, 2026-10-05).
  Token refreshes notify from inside the lock too.

  Supabase's documented fix is to defer the work out of the callback, which is
  all this does: the callback returns at once, the lock is released, and the
  handler runs on the next tick. Reproduced against the real client in
  __tests__/lib/onAuthChange.test.js.

  A listener that only sets state or fires a fetch (useAccessToken,
  useAuthEmail, SessionSync) is already safe and needs no wrapper — but must
  not be made async or start awaiting supabase.auth. The same test file scans
  src/ for that.
*/

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {(event: string, session: object|null) => unknown} handler
 * @returns the same `{ data: { subscription } }` as onAuthStateChange
 */
export function onAuthChange(supabase, handler) {
  return supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      handler(event, session);
    }, 0);
  });
}
