import { createClient } from '@supabase/supabase-js';
import { verifyAccessTokenLocal } from '@/lib/verifyJwt';

/**
 * Server-side Supabase client that uses the caller's JWT.
 * RLS policies run as the authenticated user.
 */
export function getSupabaseWithToken(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
}

/**
 * Validates a JWT and returns the Supabase user, or null if invalid.
 *
 * Fast path: when SUPABASE_JWT_SECRET is set (Worker secret in prod),
 * verifies the JWT signature locally with jose. No network call — a few
 * microseconds of crypto vs. a ~200–1000 ms round-trip to Supabase's
 * /auth/v1/user. This is the single biggest sign-in latency win because
 * requireStudent / requireLandlord and every authenticated API route
 * funnel through here.
 *
 * Fallback: when the secret is missing (local dev without the env var,
 * or CI), falls back to supabase.auth.getUser(token) so behaviour stays
 * identical — just slower. Production must have SUPABASE_JWT_SECRET set
 * to get the speedup; the fallback exists so the change doesn't
 * dark-launch when the secret isn't propagated yet.
 */
export async function getUserFromToken(token) {
  const local = await verifyAccessTokenLocal(token);
  if (local) return local;
  // Either the secret isn't configured, or verification failed. The
  // common case is the former in dev; fall through to the network so
  // missing-secret doesn't 401 every user.
  if (process.env.SUPABASE_JWT_SECRET) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * Extracts the Bearer token from an Authorization header.
 */
export function extractToken(request) {
  const header = request.headers.get('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Service-role admin client. Bypasses RLS — use ONLY for operations
 * that genuinely need it (e.g. deleting orphan auth.users rows after
 * a dual-role signup conflict). Never expose anywhere callers can
 * supply arbitrary user IDs without prior JWT validation.
 */
function getSupabaseAsService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Deletes a Supabase auth.users row via the admin API. Used by the
 * profile-creation routes to clean up the orphan auth row left behind
 * when student/landlord signup hits the dual-role guard (prevent_dual_role
 * raises 23505 after auth.signUp has already created the auth user).
 * Without this, the orphan auth user could "sign in" forever and loop
 * on the destination page's wrong-role check.
 *
 * Caller MUST validate the JWT first (so the user.id we delete is the
 * user we just authenticated, never one supplied by a request body) AND
 * SHOULD bound deletion to freshly-created users via `cleanupFreshOrphanAuthUser`
 * below — calling this directly with an old user.id will delete a real
 * account.
 */
export async function deleteAuthUserAsService(userId) {
  const admin = getSupabaseAsService();
  return admin.auth.admin.deleteUser(userId);
}

/**
 * Safer wrapper around deleteAuthUserAsService: only deletes if
 * `user.created_at` is within the last 5 minutes — i.e. clearly an
 * orphan from a just-now signup whose role-row INSERT failed. Outside
 * that window, leaves the user alone (defends against accidentally
 * nuking a legacy dual-role user re-probing through SessionSync or
 * OAuth). Swallows admin-API errors and logs them — the 409 response
 * to the user is the visible signal; cleanup failures are operational.
 *
 * Use this from any route that catches the prevent_dual_role 23505
 * and needs to roll back the auth.users row created by auth.signUp.
 */
export async function cleanupFreshOrphanAuthUser(user) {
  if (!isFreshlyCreated(user)) return;
  try {
    await deleteAuthUserAsService(user.id);
  } catch (err) {
    console.error('Failed to clean up orphan auth user:', err);
  }
}

function isFreshlyCreated(user) {
  if (!user?.created_at) return false;
  const ageMs = Date.now() - new Date(user.created_at).getTime();
  // 5 min window is generous for any reasonable signup flow; outside
  // of that, treat the auth user as "real" and leave it alone.
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 5 * 60 * 1000;
}
