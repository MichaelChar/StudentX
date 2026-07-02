import { NextResponse } from 'next/server';
import { SB_ACCESS_TOKEN_COOKIE, SB_ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/authCookies';
import { getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';
import { getExecutionCtx } from '@/lib/cloudflareEnv';

// Single post-login round-trip (#253). After signInWithPassword succeeds the
// browser used to make two sequential client→Worker hops before navigating:
// POST /api/auth/session (cookie sync) then POST /api/student/profile for
// students, or GET /api/auth/me for landlords. Both can run server-side in
// one request because the Worker→Supabase hops are cheap (the JWT is verified
// locally via JWKS since #176/#178). This route validates the token, does the
// role-specific provisioning/probe, sets the auth cookie, and returns —
// collapsing ~150–400 ms of serial latency per login into one call.
//
// The landlord branch still probes synchronously and returns 409 on a role
// conflict without setting the cookie. The student branch is cookie-first:
// it sets the cookie and defers the (idempotent) provisioning RPC via
// waitUntil, letting the destination's requireStudent guard surface any
// wrong-role conflict. The token is never echoed back in the response body.

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
    // Cookie-first: the client only needs the auth cookie set before it
    // navigates to /student/account, so don't block the response on the
    // students-row provisioning. That RPC is idempotent and, on the login
    // path, almost always a no-op (the row was created at signup) — running
    // it after the response via waitUntil takes the Worker→DB round-trip off
    // the perceived-login critical path. Edge cases stay correct without the
    // synchronous 409:
    //   - Landlord authenticating through the student form: the RPC hits the
    //     prevent_dual_role guard in the background; the destination's
    //     requireStudent guard returns wrong-role and redirects back to
    //     /student/login?roleConflict=landlord&email=… — the same banner +
    //     email prefill the old synchronous 409 produced.
    //   - Orphan auth user with no students row (a signup whose profile insert
    //     failed): the deferred RPC heals it; a sub-second navigation race
    //     self-heals on the next request, never a permanent loop.
    //
    // The old synchronous path also called cleanupFreshOrphanAuthUser on the
    // 23505 conflict; that is deliberately dropped here. On the login path
    // getUserFromToken's local-JWKS user carries created_at = token `iat`
    // (≈ now), so isFreshlyCreated() is always true and the cleanup would
    // delete a real landlord's account for merely mistyping into the student
    // form. Orphan deletion belongs to the signup flow, which does not use
    // this route.
    const provision = supabase
      .rpc('create_student_profile', { p_display_name: '', p_preferred_locale: 'en' })
      .then(({ error }) => {
        // 23505 = prevent_dual_role (email is a landlord) — expected on a
        // wrong-form login, handled by the destination guard, so don't log it.
        if (error && error.code !== '23505') {
          console.error('bootstrap: deferred create_student_profile RPC error:', error);
        }
      });

    const exec = getExecutionCtx();
    if (exec?.waitUntil) exec.waitUntil(provision);
    else await provision; // dev / no execution ctx: heal inline before responding

    const res = NextResponse.json({ ok: true, role: 'student' });
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
