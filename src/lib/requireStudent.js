import { cache } from 'react';
import { cookies } from 'next/headers';
import { SB_ACCESS_TOKEN_COOKIE } from '@/lib/authCookies';
import { getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

/**
 * Server-side helper that resolves the current student account from
 * the sb-access-token cookie set by SessionSync. Returns null when:
 *   - no cookie is present
 *   - the JWT is invalid/expired
 *   - the auth.users row exists but doesn't have a matching students row
 *     (e.g. the user signed up through the landlord flow)
 *
 * Callers (notably the listing detail page) render <AuthGate /> on null.
 *
 * Returns: { student, user, supabase } on success.
 * supabase is a token-scoped client so any further reads run under the
 * student's RLS context.
 *
 * Wrapped in React.cache() so the layout (generateMetadata + body) and
 * the page itself only pay one Supabase round-trip per request — same
 * pattern as getListingForRender.
 */
export const requireStudent = cache(async function requireStudent() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SB_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const user = await getUserFromToken(token);
  if (!user) return null;

  const supabase = getSupabaseWithToken(token);
  const { data: student, error } = await supabase
    .from('students')
    .select('student_id, email, display_name, preferred_locale')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error || !student) return null;

  return { student, user, supabase, token };
});

/**
 * Same shape as requireStudent but for landlords — used by the new
 * landlord-side chat page to authenticate without re-implementing the
 * pattern. The existing landlord protected pages still rely on
 * client-side session checks; this helper bridges the new chat RSC.
 */
export const requireLandlord = cache(async function requireLandlord() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SB_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const user = await getUserFromToken(token);
  if (!user) return null;

  const supabase = getSupabaseWithToken(token);
  const { data: landlord, error } = await supabase
    .from('landlords')
    .select('landlord_id, name, email, preferred_locale')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error || !landlord) return null;

  return { landlord, user, supabase, token };
});
