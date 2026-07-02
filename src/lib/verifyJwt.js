import { createRemoteJWKSet, jwtVerify } from 'jose';

// Local JWT verification for Supabase access tokens.
//
// Supabase now signs access tokens with an asymmetric key (ES256 / ECC
// P-256 by default — see Project Settings → Auth → JWT Signing Keys in
// the Supabase dashboard). The public key is published at the project's
// JWKS endpoint and can be fetched by anyone — there's no shared secret
// to manage, no Worker secret to set. jose's createRemoteJWKSet fetches
// the JWKS on first use, caches it for the lifetime of the Worker
// isolate, and re-fetches automatically when a token references a `kid`
// it doesn't recognise (the key-rotation case).
//
// Why bother verifying locally at all? requireStudent / requireLandlord
// and every authenticated API route used to call supabase.auth.getUser
// which is a ~200–1000 ms round-trip to Supabase Auth. Local verification
// is a few microseconds of crypto. The win compounds across every
// authenticated server check.
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
// branch and don't need to distinguish failure modes. getUserFromToken
// in supabaseServer.js then transparently falls back to the network on
// null, so a JWKS fetch failure / network blip degrades to "slow" not
// "broken".

let _jwks;
let _jwksUrlSource;

function getJwks() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  // Cache the JWKS resolver per isolate, keyed by the URL it was built
  // for. Recreating it on every call would defeat the internal cache
  // that makes the fast path fast.
  if (_jwks && _jwksUrlSource === supabaseUrl) return _jwks;
  _jwksUrlSource = supabaseUrl;
  _jwks = createRemoteJWKSet(
    new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    {
      // Re-fetch the JWKS at most once every 10 minutes under normal
      // operation. The 30-second cooldown bounds how often we'll retry
      // a fetch when a token references an unknown `kid` (the rotation
      // signal) — prevents a misbehaving client from spamming the
      // upstream with one fetch per failed token.
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    },
  );
  return _jwks;
}

export async function verifyAccessTokenLocal(token) {
  if (!token || typeof token !== 'string') return null;
  const jwks = getJwks();
  if (!jwks) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      // Supabase access tokens carry aud="authenticated" — pinning this
      // rejects refresh tokens, anon-role tokens, or anything else an
      // attacker could try to coerce through.
      audience: 'authenticated',
    });

    if (!payload.sub) return null;

    // Mirror the @supabase/supabase-js user shape so call sites don't
    // care which path resolved the user.
    return {
      id: payload.sub,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      role: payload.role ?? null,
      aud: payload.aud ?? null,
      app_metadata: payload.app_metadata ?? {},
      user_metadata: payload.user_metadata ?? {},
      // Deliberately NOT set from payload.iat. `iat` is the token's
      // issued-at time — refreshed on every sign-in / token refresh, so
      // it is ≈ "now" for any freshly authenticated request, NOT the
      // auth.users account-creation time. The JWT carries no real
      // created_at claim. Populating it from iat made
      // isFreshlyCreated() (supabaseServer.js) fire for essentially every
      // locally-verified user, so cleanupFreshOrphanAuthUser could delete
      // a real dual-role account. Any caller that needs the true
      // created_at must fetch the authoritative user (admin.getUserById);
      // cleanupFreshOrphanAuthUser now does exactly that.
      created_at: null,
    };
  } catch {
    return null;
  }
}
