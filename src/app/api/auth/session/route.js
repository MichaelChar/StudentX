import { NextResponse } from 'next/server';
import { SB_ACCESS_TOKEN_COOKIE, SB_ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/authCookies';
import { getUserFromToken } from '@/lib/supabaseServer';

// Bridges the browser-side Supabase session into a server-readable cookie.
// SessionSync calls POST whenever onAuthStateChange fires with a session,
// and DELETE on sign-out. RSCs and route handlers then read the cookie via
// requireStudent / requireLandlord without needing a JS bundle on the page.
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

  // Validate the token before persisting — otherwise a malicious client could
  // shove arbitrary text into our cookie and we'd echo it on every server
  // request. Validation also guards against confused-deputy use of an old
  // landlord token after a student logs in (and vice versa).
  const user = await getUserFromToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SB_ACCESS_TOKEN_COOKIE,
    value: accessToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SB_ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SB_ACCESS_TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
