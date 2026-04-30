/**
 * Race a promise against a timeout. Resolves with the promise's value if it
 * settles before `ms` elapses, otherwise rejects with a "Request timed out"
 * error. Used in auth-flow handlers (login / signup / reset-password) where
 * a hung Supabase call or fetch would otherwise leave the user stuck on a
 * loading spinner with no error message and no way to recover — typically
 * caused by Cloudflare Workers cold-start latency or transient mobile-network
 * drops.
 */
export function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timed out. Please try again.')),
        ms,
      ),
    ),
  ]);
}
