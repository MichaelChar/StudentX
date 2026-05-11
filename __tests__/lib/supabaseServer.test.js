import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every createClient invocation across the suite. The
// service-role admin client uses createClient under the hood; this lets
// us assert on whether deleteUser was reached.
const deleteUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { admin: { deleteUser: (...args) => deleteUser(...args) } },
  })),
}));

// Provide the env vars the SUT reads when instantiating the admin client.
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  deleteUser.mockReset();
  deleteUser.mockResolvedValue({ data: null, error: null });
});

const { extractToken, cleanupFreshOrphanAuthUser } = await import('@/lib/supabaseServer');

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
  it('deletes when the user was created seconds ago', async () => {
    await cleanupFreshOrphanAuthUser({
      id: 'u1',
      created_at: new Date(Date.now() - 5_000).toISOString(),
    });
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });

  it('deletes when the user was created near the 5-min edge (still inside)', async () => {
    await cleanupFreshOrphanAuthUser({
      id: 'u2',
      created_at: new Date(Date.now() - (5 * 60 * 1000 - 1_000)).toISOString(),
    });
    expect(deleteUser).toHaveBeenCalledWith('u2');
  });

  it('does NOT delete when the user is older than 5 minutes', async () => {
    await cleanupFreshOrphanAuthUser({
      id: 'u3',
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does NOT delete when created_at is missing', async () => {
    await cleanupFreshOrphanAuthUser({ id: 'u4' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does NOT delete when created_at is malformed', async () => {
    await cleanupFreshOrphanAuthUser({ id: 'u5', created_at: 'not-a-date' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('swallows admin-API errors so the caller can still return its response', async () => {
    deleteUser.mockRejectedValueOnce(new Error('admin api 500'));
    await expect(
      cleanupFreshOrphanAuthUser({
        id: 'u6',
        created_at: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });
});
