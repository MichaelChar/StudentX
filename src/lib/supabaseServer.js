import { createClient } from '@supabase/supabase-js';

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
 */
export async function getUserFromToken(token) {
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
 * Caller must validate the JWT first — only the user who just signed up
 * should ever invoke this for their own user.id.
 */
export async function deleteAuthUserAsService(userId) {
  const admin = getSupabaseAsService();
  return admin.auth.admin.deleteUser(userId);
}
