import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every createClient invocation across the suite. The
// service-role admin client uses createClient under the hood; this lets
// us assert on whether deleteUser was reached. The anon client uses
// createClient too — its auth.getUser is the network-fallback path that
// runs when local JWT verification doesn't return a user.
const deleteUser = vi.fn();
const getUser = vi.fn();
const getUserById = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        deleteUser: (...args) => deleteUser(...args),
        getUserById: (...args) => getUserById(...args),
      },
      getUser: (...args) => getUser(...args),
    },
  })),
}));

// Mock the local verifier so each test can control whether the fast
// path returns a user or punts to the network fallback.
const verifyAccessTokenLocal = vi.fn();
vi.mock('@/lib/verifyJwt', () => ({
  verifyAccessTokenLocal: (...args) => verifyAccessTokenLocal(...args),
}));

// Provide the env vars the SUT reads when instantiating its clients.
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  deleteUser.mockReset();
  deleteUser.mockResolvedValue({ data: null, error: null });
  getUser.mockReset();
  getUserById.mockReset();
  verifyAccessTokenLocal.mockReset();
});

// Helper: make admin.getUserById resolve to an auth user with the given
// created_at. The freshness decision is made against THIS row, never the
// object passed to cleanupFreshOrphanAuthUser (which, on the local-JWKS
// fast path, has no trustworthy created_at).
function authUserCreatedAt(created_at) {
  return { data: { user: { id: 'u', created_at } }, error: null };
}

const { extractToken, cleanupFreshOrphanAuthUser, getUserFromToken } = await import('@/lib/supabaseServer');

function req(authHeader) {
  return {
    headers: {
      get: (name) => (name === 'Authorization' && authHeader != null ? authHeader : null),
    },
  };
}

describe('extractToken', () => {
  it('returns the bearer value from a well-formed Authorization header', () => {
    expect(extractToken(req('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('returns null when the header is missing', () => {
    expect(extractToken(req(null))).toBeNull();
  });

  it('returns null when the scheme is not Bearer', () => {
    expect(extractToken(req('Basic dXNlcjpwYXNz'))).toBeNull();
  });

  it('returns an empty string for "Bearer " with no token (callers treat falsy as no-token)', () => {
    // Documents current behavior — extractToken doesn't validate non-empty.
    expect(extractToken(req('Bearer '))).toBe('');
  });
});

describe('cleanupFreshOrphanAuthUser — recency guard', () => {
  it('deletes when the AUTHORITATIVE user was created seconds ago', async () => {
    getUserById.mockResolvedValueOnce(authUserCreatedAt(new Date(Date.now() - 5_000).toISOString()));
    await cleanupFreshOrphanAuthUser({ id: 'u1' });
    expect(getUserById).toHaveBeenCalledWith('u1');
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });

  it('deletes when the user was created near the 5-min edge (still inside)', async () => {
    getUserById.mockResolvedValueOnce(
      authUserCreatedAt(new Date(Date.now() - (5 * 60 * 1000 - 1_000)).toISOString())
    );
    await cleanupFreshOrphanAuthUser({ id: 'u2' });
    expect(deleteUser).toHaveBeenCalledWith('u2');
  });

  it('does NOT delete when the authoritative user is older than 5 minutes', async () => {
    getUserById.mockResolvedValueOnce(authUserCreatedAt(new Date(Date.now() - 10 * 60 * 1000).toISOString()));
    await cleanupFreshOrphanAuthUser({ id: 'u3' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  // The core regression: a legacy/real dual-role user hits a profile
  // endpoint with a freshly refreshed token. The passed object carries a
  // "now"-ish created_at (what the old iat-derived local verifier would
  // have produced), but the real account is months old. Must NOT delete.
  it('does NOT delete a real dual-role user even when the passed object looks fresh', async () => {
    getUserById.mockResolvedValueOnce(
      authUserCreatedAt(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    );
    await cleanupFreshOrphanAuthUser({
      id: 'real-user',
      // iat-derived timestamp ≈ now — deliberately ignored by the guard.
      created_at: new Date().toISOString(),
    });
    expect(getUserById).toHaveBeenCalledWith('real-user');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does NOT delete when the authoritative created_at is missing', async () => {
    getUserById.mockResolvedValueOnce(authUserCreatedAt(undefined));
    await cleanupFreshOrphanAuthUser({ id: 'u4' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does NOT delete when the authoritative created_at is malformed', async () => {
    getUserById.mockResolvedValueOnce(authUserCreatedAt('not-a-date'));
    await cleanupFreshOrphanAuthUser({ id: 'u5' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does NOT delete (fails safe) when the admin lookup errors', async () => {
    getUserById.mockResolvedValueOnce({ data: null, error: { message: 'admin api 500' } });
    await cleanupFreshOrphanAuthUser({ id: 'u7' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does NOT delete (fails safe) when the admin lookup throws', async () => {
    getUserById.mockRejectedValueOnce(new Error('network down'));
    await cleanupFreshOrphanAuthUser({ id: 'u8' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does NOT call the admin API at all when no user id is supplied', async () => {
    await cleanupFreshOrphanAuthUser({});
    expect(getUserById).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('swallows admin delete errors so the caller can still return its response', async () => {
    getUserById.mockResolvedValueOnce(authUserCreatedAt(new Date().toISOString()));
    deleteUser.mockRejectedValueOnce(new Error('admin api 500'));
    await expect(cleanupFreshOrphanAuthUser({ id: 'u6' })).resolves.toBeUndefined();
  });
});

describe('getUserFromToken — local-then-network fallback', () => {
  it('returns the local user when local verification succeeds (no network call)', async () => {
    verifyAccessTokenLocal.mockResolvedValueOnce({
      id: 'auth-user-1',
      email: 'a@example.com',
    });
    const user = await getUserFromToken('valid.jwt.token');
    expect(user).toEqual({ id: 'auth-user-1', email: 'a@example.com' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('falls back to network when local verification returns null (covers rotated/missing secret)', async () => {
    // This is the case the inverted-fallback bug masked: local fails
    // because the secret is missing OR rotated; we still want a valid
    // token to authenticate rather than 401 every user at once.
    verifyAccessTokenLocal.mockResolvedValueOnce(null);
    getUser.mockResolvedValueOnce({
      data: { user: { id: 'auth-user-2', email: 'b@example.com' } },
      error: null,
    });
    const user = await getUserFromToken('valid.jwt.token');
    expect(user).toEqual({ id: 'auth-user-2', email: 'b@example.com' });
    expect(getUser).toHaveBeenCalledWith('valid.jwt.token');
  });

  it('returns null when both local AND network reject (genuinely invalid token)', async () => {
    verifyAccessTokenLocal.mockResolvedValueOnce(null);
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid JWT' },
    });
    expect(await getUserFromToken('bogus.token')).toBeNull();
  });

  it('returns null when network call returns no user (no error, but no user)', async () => {
    verifyAccessTokenLocal.mockResolvedValueOnce(null);
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await getUserFromToken('bogus.token')).toBeNull();
  });
});
