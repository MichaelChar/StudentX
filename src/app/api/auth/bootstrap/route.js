import { NextResponse } from 'next/server';
import { SB_ACCESS_TOKEN_COOKIE, SB_ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/authCookies';
import {
  getUserFromToken,
  getSupabaseWithToken,
  cleanupFreshOrphanAuthUser,
} from '@/lib/supabaseServer';

// Single post-login round-trip (#253). After signInWithPassword succeeds the
// browser used to make two sequential client→Worker hops before navigating:
// POST /api/auth/session (cookie sync) then POST /api/student/profile for
// students, or GET /api/auth/me for landlords. Both can run server-side in
// one request because the Worker→Supabase hops are cheap (the JWT is verified
// locally via JWKS since #176/#178). This route validates the token, does the
// role-specific provisioning/probe, sets the auth cookie, and returns —
// collapsing ~150–400 ms of serial latency per login into one call.
//
// On a 409 role conflict the cookie is deliberately NOT set (the client signs
// out in that case); the token is never echoed back in the response body.

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

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
  }
  const role = body.role === 'student' || body.role === 'landlord' ? body.role : null;
  if (!role) {
    return NextResponse.json({ error: 'role must be "student" or "landlord"' }, { status: 400 });
  }

  // Validate before persisting — same confused-deputy rationale as
  // /api/auth/session: never write an unverified token into our cookie. This
  // is the local JWKS fast path, so it costs microseconds on a valid token.
  const user = await getUserFromToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const supabase = getSupabaseWithToken(accessToken);

  if (role === 'student') {
    // Idempotent provisioning — mirrors POST /api/student/profile. Returns the
    // existing students row when one is present, so it's a no-op on the happy
    // path. A prevent_dual_role 23505 means the email is already a landlord.
    const { data: rows, error } = await supabase.rpc('create_student_profile', {
      p_display_name: '',
      p_preferred_locale: 'en',
    });
    if (error) {
      if (error.code === '23505' && /already registered as a landlord/i.test(error.message || '')) {
        await cleanupFreshOrphanAuthUser(user);
        return NextResponse.json(
          { error: 'role_conflict', conflict_role: 'landlord' },
          { status: 409 },
        );
      }
      console.error('bootstrap: create_student_profile RPC error:', error);
      return NextResponse.json({ error: 'Failed to bootstrap session' }, { status: 500 });
    }
    // PostgREST returns a single object (not an array) for a record-returning fn.
    const student = Array.isArray(rows) ? rows[0] : rows;
    const res = NextResponse.json({ ok: true, role: 'student', name: student?.display_name ?? null });
    res.cookies.set(authCookie(accessToken));
    return res;
  }

  // role === 'landlord': mirror GET /api/auth/me's role probe. A students row
  // with no landlords row is a wrong-role login → 409 (client signs out, no
  // cookie). A landlords row → proceed. Neither (orphan) or a probe-unavailable
  // read → proceed with role:null; the dashboard's server-side requireLandlord
  // guard bounces bad sessions, so it needn't be special-cased here.
  const [studentRes, landlordRes] = await Promise.all([
    supabase.from('students').select('display_name').eq('auth_user_id', user.id).maybeSingle(),
    supabase.from('landlords').select('name').eq('auth_user_id', user.id).maybeSingle(),
  ]);
  const student = studentRes.data;
  const landlord = landlordRes.data;

  if (student && !landlord) {
    return NextResponse.json(
      { error: 'role_conflict', conflict_role: 'student' },
      { status: 409 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    role: landlord ? 'landlord' : null,
    name: landlord?.name ?? null,
  });
  res.cookies.set(authCookie(accessToken));
  return res;
}
