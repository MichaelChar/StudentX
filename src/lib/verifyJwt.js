import { jwtVerify } from 'jose';

// Local JWT verification for Supabase access tokens. Supabase issues HS256
// JWTs signed with SUPABASE_JWT_SECRET (Project Settings → API → JWT
// Settings in the Supabase dashboard). Verifying locally with jose is a
// few microseconds of crypto vs. a ~200–1000 ms round-trip to
// /auth/v1/user — which compounds because requireStudent /
// requireLandlord and every authenticated API route call this on every
// request.
//
// Trade-off: a locally-verified token doesn't catch revocations within
// its 1-hour TTL. We don't currently revoke tokens (sign-out only clears
// client state), so this is acceptable. If we ever add server-side
// revocation we'd need a denylist or an opt-in slow path that hits
// Supabase Auth.
//
// Returns the same shape as Supabase's auth.getUser when valid:
//   { id, email, role, aud, app_metadata, user_metadata, ... }
// Returns null when the token is missing, malformed, expired, or fails
// signature verification — callers can keep their existing `if (!user)`
// branch and don't need to distinguish failure modes.

let _cachedKey;
let _cachedKeySource;

function getKey() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  // Cache the encoded key across requests in the same Worker isolate.
  // TextEncoder is cheap but encoding the same secret on every auth check
  // is needless work.
  if (_cachedKey && _cachedKeySource === secret) return _cachedKey;
  _cachedKey = new TextEncoder().encode(secret);
  _cachedKeySource = secret;
  return _cachedKey;
}

export async function verifyAccessTokenLocal(token) {
  if (!token || typeof token !== 'string') return null;
  const key = getKey();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      // Supabase access tokens carry aud="authenticated" — pinning this
      // rejects refresh tokens, anon-role tokens, or anything else the
      // attacker could try to coerce through.
      audience: 'authenticated',
    });

    if (!payload.sub) return null;

    // Mirror the @supabase/supabase-js user shape so call sites don't care
    // which path resolved the user.
    return {
      id: payload.sub,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      role: payload.role ?? null,
      aud: payload.aud ?? null,
      app_metadata: payload.app_metadata ?? {},
      user_metadata: payload.user_metadata ?? {},
      created_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
    };
  } catch {
    return null;
  }
}
