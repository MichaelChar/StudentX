import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';

const SUPABASE_URL = 'https://example.supabase.co';
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

// One real ES256 keypair shared across the suite — generating per test
// is wasteful and the SUT caches its JWKS resolver per isolate, so the
// test fixtures need to match what the resolver fetched on first use.
let privateKey;
let publicJwk;
let otherPrivateKey;

beforeAll(async () => {
  const kp = await generateKeyPair('ES256');
  privateKey = kp.privateKey;
  publicJwk = { ...(await exportJWK(kp.publicKey)), kid: 'test-key-1', alg: 'ES256', use: 'sig' };

  const other = await generateKeyPair('ES256');
  otherPrivateKey = other.privateKey;
});

// Stub global fetch so jose's createRemoteJWKSet resolves the test
// keypair's public half instead of hitting the network. The SUT calls
// fetch with the JWKS endpoint URL.
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input);
    if (url === JWKS_URL) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
});

const { verifyAccessTokenLocal } = await import('@/lib/verifyJwt');

async function signWith(key, payload, { kid = 'test-key-1' } = {}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

describe('verifyAccessTokenLocal', () => {
  it('returns a Supabase-shaped user when the token is valid', async () => {
    const token = await signWith(privateKey, {
      sub: 'auth-user-123',
      email: 'happy@example.com',
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { display_name: 'Happy' },
    });

    const user = await verifyAccessTokenLocal(token);
    expect(user).not.toBeNull();
    expect(user.id).toBe('auth-user-123');
    expect(user.email).toBe('happy@example.com');
    expect(user.role).toBe('authenticated');
    expect(user.aud).toBe('authenticated');
    expect(user.app_metadata).toEqual({ provider: 'email' });
    expect(user.user_metadata).toEqual({ display_name: 'Happy' });
  });

  it('does NOT derive created_at from iat (iat ≈ now, not account creation)', async () => {
    // Regression guard: iat is refreshed on every sign-in / token
    // refresh, so trusting it as created_at made the orphan-cleanup
    // freshness window fire for every authenticated request. The local
    // path leaves created_at null; the true value comes from the admin
    // API when a caller actually needs it.
    const token = await signWith(privateKey, {
      sub: 'auth-user-123',
      aud: 'authenticated',
    });
    const user = await verifyAccessTokenLocal(token);
    expect(user.created_at).toBeNull();
  });

  it('returns null when the signature is wrong (token signed with a different key)', async () => {
    const token = await signWith(otherPrivateKey, {
      sub: 'auth-user-1',
      aud: 'authenticated',
    });
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null when the audience is not "authenticated" (refresh token, anon, etc.)', async () => {
    const token = await new SignJWT({ sub: 'auth-user-1', aud: 'anon' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-1' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null when the token is expired', async () => {
    const token = await new SignJWT({ sub: 'auth-user-1', aud: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-1' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null for malformed / empty / non-string tokens', async () => {
    expect(await verifyAccessTokenLocal('')).toBeNull();
    expect(await verifyAccessTokenLocal(null)).toBeNull();
    expect(await verifyAccessTokenLocal(undefined)).toBeNull();
    expect(await verifyAccessTokenLocal('not-a-jwt')).toBeNull();
    expect(await verifyAccessTokenLocal(12345)).toBeNull();
  });

  it('returns null when NEXT_PUBLIC_SUPABASE_URL is unset (caller falls back to network path)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const token = await signWith(privateKey, { sub: 'auth-user-1', aud: 'authenticated' });
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null when the token has no sub claim', async () => {
    const token = await new SignJWT({ aud: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-1' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });
});
