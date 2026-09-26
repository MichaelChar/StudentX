import { NextResponse } from 'next/server';
import { SB_ACCESS_TOKEN_COOKIE, SB_ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/authCookies';
import { getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

// Single post-login round-trip (#253), called by the unified /login page right
// after signInWithPassword succeeds. It validates the token, works out which
// kind of account this is, sets the auth cookie, and tells the client where
// the user belongs — one Worker hop instead of the old sequential
// session-sync + profile-probe pair.
//
// ROLE IS DETECTED HERE, NOT SUPPLIED BY THE CLIENT. There used to be two
// login pages, each posting the role it expected, and a user on the wrong one
// got a conflict banner and had to sign in a second time elsewhere. Supabase
// auth itself was always role-agnostic, so one page can serve both — the only
// question is which row this auth user owns. Any `role` in the body is ignored
// (a stale tab from before the unification may still send one).
//
// Resolution order, and why:
//   1. landlords row by auth_user_id → 'landlord'
//   2. students row by auth_user_id  → 'student'
//      Rows beat metadata: prod has a landlord whose user_metadata.role says
//      'student' (they started on the student form). The row is the truth.
//   3. Neither row — an account whose profile was never created:
//      a. an UNCLAIMED landlords row with this email → 'landlord-incomplete'
//         (issue #148's orphan; the client claims it via /api/landlord/profile)
//      b. user_metadata.role === 'student' → provision the students row now
//      c. anything else → 'landlord-incomplete'
//
// 3c is deliberate, and it is the trap this ordering exists to avoid. The old
// student bootstrap provisioned a students row for ANY auth user that lacked
// one. On a shared page that would silently turn every half-created landlord
// into a student — permanently, because prevent_dual_role (migration 036) then
// blocks the landlord row forever. Student signups have always set
// user_metadata.role = 'student' (migration 029's trigger keys on it, and it
// creates the row at signup), so an account with no row and no student marker
// is a landlord signup whose profile POST never ran. Verified against prod on
// 2026-09-25: both such accounts were landlord signups.
//
// 'landlord-incomplete' still gets the cookie: the client immediately POSTs
// /api/landlord/profile (idempotent — returns, links, or creates the row) and
// only then navigates.

function authCookie(value) {
  return {
    name: SB_ACCESS_TOKEN_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SB_ACCESS_TOKEN_MAX_AGE_SECONDS,
  };
}

function withCookie(payload, accessToken) {
  const res = NextResponse.json({ ok: true, ...payload });
  res.cookies.set(authCookie(accessToken));
  return res;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accessToken = typeof body?.access_token === 'string' ? body.access_token : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
  }

  // Validate before persisting — same confused-deputy rationale as
  // /api/auth/session: never write an unverified token into our cookie. This
  // is the local JWKS fast path, so it costs microseconds on a valid token.
  const user = await getUserFromToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const supabase = getSupabaseWithToken(accessToken);

  const [landlordRes, studentRes] = await Promise.all([
    supabase.from('landlords').select('name').eq('auth_user_id', user.id).maybeSingle(),
    supabase.from('students').select('display_name').eq('auth_user_id', user.id).maybeSingle(),
  ]);

  // A failed probe must not be read as "no row" — that would send an existing
  // student down the landlord-completion path. prevent_dual_role would still
  // block the wrong row, but the user would see a confusing error instead of a
  // retry. No cookie; the client says "try again".
  if (landlordRes.error || studentRes.error) {
    console.error('bootstrap: role probe failed:', landlordRes.error || studentRes.error);
    return NextResponse.json({ error: 'probe_failed' }, { status: 503 });
  }

  if (landlordRes.data) {
    return withCookie({ role: 'landlord', name: landlordRes.data.name ?? null }, accessToken);
  }
  if (studentRes.data) {
    return withCookie({ role: 'student' }, accessToken);
  }

  // --- Neither row (rare) -------------------------------------------------

  // 3a. Unclaimed landlord row waiting for this email. `ilike` with no
  // wildcards is case-insensitive equality, matching prevent_dual_role's
  // lower() comparison; same query requireStudent uses for #148.
  if (user.email) {
    const { data: orphan } = await supabase
      .from('landlords')
      .select('landlord_id')
      .is('auth_user_id', null)
      .ilike('email', user.email)
      .maybeSingle();
    if (orphan) return withCookie({ role: 'landlord-incomplete' }, accessToken);
  }

  // 3b. A student signup whose row is missing (the signup trigger normally
  // creates it). Provision inline — this path is rare enough that awaiting it
  // costs nothing, and the answer decides where the user goes.
  if (user.user_metadata?.role === 'student') {
    const { error } = await supabase.rpc('create_student_profile', {
      p_display_name: '',
      p_preferred_locale: 'en',
    });
    if (!error) return withCookie({ role: 'student' }, accessToken);
    // 23505 = prevent_dual_role: the email already belongs to a landlord.
    if (error.code === '23505') return withCookie({ role: 'landlord-incomplete' }, accessToken);
    // Anything else: still a student. The destination's requireStudent guard
    // re-probes, so a transient failure costs a bounce, not a wrong role.
    console.error('bootstrap: create_student_profile RPC error:', error);
    return withCookie({ role: 'student' }, accessToken);
  }

  // 3c. No row, no student marker → a landlord signup that never finished.
  return withCookie({ role: 'landlord-incomplete' }, accessToken);
}
