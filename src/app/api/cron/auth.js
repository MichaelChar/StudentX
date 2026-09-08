/**
 * Shared CRON_SECRET gate for every /api/cron/* route.
 *
 * HEADER ONLY. It used to also accept `?secret=`, which put the shared secret
 * into any URL that reached a log, a proxy, a browser history or an error
 * report — the classic "secret in a query string" leak (#245). Nothing needed
 * it: `cf/worker-entry.mjs` dispatches the scheduled handler with an
 * `x-cron-secret` header, and its one CRON_ROUTES entry carries `query: null`.
 *
 * Manual invocation therefore also needs the header:
 *
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://studentx.uk/api/cron/synthetic-en-listing
 *
 * A missing CRON_SECRET fails CLOSED — an unset secret must never mean
 * "everyone is authorized".
 */
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('x-cron-secret') === secret;
}
