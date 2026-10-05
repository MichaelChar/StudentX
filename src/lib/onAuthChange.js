/*
  Subscribe to Supabase auth changes with a handler that may call back into
  supabase.auth (getSession, getUser, refreshSession, …).

  WHY NOT supabase.auth.onAuthStateChange DIRECTLY. gotrue runs every auth
  operation behind one lock and notifies listeners from INSIDE it, awaiting
  each one: signOut() takes the lock, removes the session, then awaits every
  listener before releasing (auth-js 2.105.0, GoTrueClient _removeSession →
  _notifyAllSubscribers); a token refresh does the same with TOKEN_REFRESHED.
  A listener that awaits getSession() queues behind the very operation that is
  waiting for it — a deadlock that only breaks when the listener's own timeout
  fires. Navbar's did exactly this, so every sign-out and every token refresh
  held the lock for its 15 s withTimeout. Anything that touched the lock in
  that window waited too: measured 2026-10-05, sign-out followed by a sign-in
  in the same tab took 30 s, because the login page's pre-sign-in
  getSession() / local signOut queued behind the stalled sign-outs.

  Supabase's documented fix is to defer the work out of the callback, which is
  what this does: the callback returns at once, the lock is released, and the
  handler runs on the next tick. Reproduced against the real client in
  __tests__/lib/onAuthChange.test.js.

  Deferring means handlers for consecutive events can overlap — a caller whose
  handler does async work must make the newest run win (Navbar's authGen).

  A listener that only sets state or fires a fetch (useAccessToken,
  useAuthEmail, SessionSync) is already safe and needs no wrapper — but must
  stay synchronous and block-bodied. The same test file scans src/ for that.
*/

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {(event: string, session: object|null) => unknown} handler
 * @returns the same `{ data: { subscription } }` shape as onAuthStateChange
 */
export function onAuthChange(supabase, handler) {
  let active = true;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      // A handler already queued when the caller unsubscribed must not run:
      // gotrue's unsubscribe only stops FUTURE notifications.
      if (active) handler(event, session);
    }, 0);
  });
  return {
    data: {
      subscription: {
        id: subscription.id,
        unsubscribe() {
          active = false;
          subscription.unsubscribe();
        },
      },
    },
  };
}
