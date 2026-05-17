import { describe, it, expect, beforeEach } from 'vitest';
import { SignJWT } from 'jose';

const SECRET = 'test-jwt-secret-with-enough-entropy-to-be-realistic';

async function signSupabaseLike(payload, { secret = SECRET, alg = 'HS256' } = {}) {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = SECRET;
});

const { verifyAccessTokenLocal } = await import('@/lib/verifyJwt');

describe('verifyAccessTokenLocal', () => {
  it('returns a Supabase-shaped user when the token is valid', async () => {
    const token = await signSupabaseLike({
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

  it('returns null when the signature is wrong (token signed with a different secret)', async () => {
    const token = await signSupabaseLike(
      { sub: 'auth-user-1', aud: 'authenticated' },
      { secret: 'a-different-secret' }
    );
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null when the audience is not "authenticated" (refresh token, anon, etc.)', async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ sub: 'auth-user-1', aud: 'anon' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null when the token is expired', async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ sub: 'auth-user-1', aud: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key);
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null for malformed / empty / non-string tokens', async () => {
    expect(await verifyAccessTokenLocal('')).toBeNull();
    expect(await verifyAccessTokenLocal(null)).toBeNull();
    expect(await verifyAccessTokenLocal(undefined)).toBeNull();
    expect(await verifyAccessTokenLocal('not-a-jwt')).toBeNull();
    expect(await verifyAccessTokenLocal(12345)).toBeNull();
  });

  it('returns null when SUPABASE_JWT_SECRET is unset (caller falls back to network path)', async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const token = await signSupabaseLike({ sub: 'auth-user-1', aud: 'authenticated' });
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });

  it('returns null when the token has no sub claim', async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ aud: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    expect(await verifyAccessTokenLocal(token)).toBeNull();
  });
});
