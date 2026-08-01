/**
 * Shared CRON_SECRET gate for every /api/cron/* route.
 * Accepts either the x-cron-secret header or a ?secret= query param.
 */
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === secret;
}
