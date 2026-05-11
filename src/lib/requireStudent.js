import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { SB_ACCESS_TOKEN_COOKIE } from '@/lib/authCookies';
import { getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

// Fast cookie-presence probe via the raw Cookie header. Anonymous
// requests skip cookies() (and the Supabase round-trip) entirely,
// trimming work on the 99% guest-visitor path. The response itself
// stays uncacheable — next.config.mjs keeps /listing/* on
// PRIVATE_CACHE_HEADERS because the static config rule wins over
// Next's runtime per-request cache header, so we can't safely split
// anon vs auth from a single RSC path without middleware. See the
// inline comment in next.config.mjs for the verification trail.
export async function hasAuthCookie() {
  const h = await headers();
  const cookieHeader = h.get('cookie') || '';
  return cookieHeader.includes(`${SB_ACCESS_TOKEN_COOKIE}=`);
}

/**
 * Server-side helper that resolves the current student account from
 * the sb-access-token cookie set by SessionSync. Returns one of:
 *   - { student, user, supabase, token } — authenticated as a student
 *   - { kind: 'wrong-role', conflict_role, email } — JWT is valid but the
 *     auth.users row has no matching students row. conflict_role is
 *     'landlord' if the email is registered as a landlord, or null
 *     otherwise (true orphan — should be rare given migration 029's
 *     trigger). Callers redirect to login with these as query params so
 *     the login page can render a "this email is a landlord — switch"
 *     CTA instead of a silent bounce. Truthy on purpose so AuthGate can
 *     short-circuit too.
 *   - null — no cookie present, or JWT invalid/expired (guest)
 *
 * Existing callers that did `if (!auth)` need to also handle the
 * wrong-role case: `if (!auth || auth.kind === 'wrong-role')`.
 *
 * supabase is a token-scoped client so any further reads run under the
 * student's RLS context.
 *
 * Wrapped in React.cache() so the layout (generateMetadata + body) and
 * the page itself only pay one Supabase round-trip per request — same
 * pattern as getListingForRender.
 */
export const requireStudent = cache(async function requireStudent() {
  if (!(await hasAuthCookie())) return null;
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

  if (error || !student) {
    // Wrong-role: probe the landlords table so the redirect can carry
    // the conflict context. One extra round-trip only on the unhappy
    // path; the cache wrapper still amortises across layout + page.
    const { data: landlord } = await supabase
      .from('landlords')
      .select('email')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    return {
      kind: 'wrong-role',
      conflict_role: landlord ? 'landlord' : null,
      email: landlord?.email ?? user.email ?? null,
    };
  }

  return { student, user, supabase, token };
});

/**
 * Same shape as requireStudent but for landlords. Returns:
 *   - { landlord, user, supabase, token } — authenticated as a landlord
 *   - { kind: 'wrong-role', conflict_role, email } — JWT valid but no
 *     landlords row. conflict_role is 'student' if the email is a
 *     student, or null otherwise. Mirrors requireStudent's contract so
 *     landlord-side wrong-role redirects can render the same kind of
 *     "switch to student login" CTA. Existing callers that did
 *     `if (!auth)` should now also handle `auth.kind === 'wrong-role'`.
 *   - null — no cookie present, or JWT invalid/expired (guest)
 */
export const requireLandlord = cache(async function requireLandlord() {
  if (!(await hasAuthCookie())) return null;
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

  if (error || !landlord) {
    const { data: student } = await supabase
      .from('students')
      .select('email')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    return {
      kind: 'wrong-role',
      conflict_role: student ? 'student' : null,
      email: student?.email ?? user.email ?? null,
    };
  }

  return { landlord, user, supabase, token };
});
