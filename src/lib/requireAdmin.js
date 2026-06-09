import { cache } from 'react';
import { cookies } from 'next/headers';
import { SB_ACCESS_TOKEN_COOKIE } from '@/lib/authCookies';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

/**
 * Admin gate for the pending-listings pipeline.
 *
 * Reuses the existing admin model (already used by /api/admin/metrics and
 * /api/admin/verifications): a normal Supabase-authenticated user whose email
 * is in the ADMIN_EMAILS allowlist. There is intentionally NO separate
 * password / ADMIN_TOKEN — the operator signs in through the normal login and
 * is allowlisted by email.
 *
 * IMPORTANT (operational): ADMIN_EMAILS is read from process.env and is NOT set
 * anywhere in this repo. Until the operator runs
 *   wrangler secret put ADMIN_EMAILS --name studentx
 * (value e.g. michaelcharlesg@icloud.com), isAdminEmail() returns false for
 * everyone and ALL admin routes — old and new — return 403/redirect.
 */
export function isAdminEmail(email) {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(String(email).toLowerCase());
}

/**
 * Server-component gate, mirroring requireLandlord(). Resolves the admin from
 * the sb-access-token cookie. Returns one of:
 *   - { user, supabase, token } — authenticated AND allowlisted (an admin)
 *   - { kind: 'not-admin', email } — valid session but email not allowlisted
 *   - null — no cookie / invalid-expired JWT (a guest)
 *
 * Page usage:
 *   const admin = await requireAdmin();
 *   if (!admin) redirect(`/property/thessaloniki/landlord/login?next=${...}`);
 *   if (admin.kind === 'not-admin') return <NotAuthorized email={admin.email} />;
 *
 * Wrapped in React.cache() so a layout + page share one round-trip, like the
 * requireStudent / requireLandlord helpers.
 */
export const requireAdmin = cache(async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SB_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const user = await getUserFromToken(token);
  if (!user) return null;

  if (!isAdminEmail(user.email)) {
    return { kind: 'not-admin', email: user.email ?? null };
  }

  const supabase = getSupabaseWithToken(token);
  return { user, supabase, token };
});

/**
 * Route-handler gate (Bearer token in the Authorization header), mirroring the
 * inline isAdmin() pattern in the existing admin API routes. Returns a
 * discriminated result so callers can early-return the right status:
 *   - { ok: true, user, token }
 *   - { ok: false, status: 401, error } — missing / invalid token
 *   - { ok: false, status: 403, error } — valid token, not allowlisted
 */
export async function requireAdminApi(request) {
  const token = extractToken(request);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };

  const user = await getUserFromToken(token);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };

  if (!isAdminEmail(user.email)) return { ok: false, status: 403, error: 'Forbidden' };

  return { ok: true, user, token };
}
