import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for the SUT's dependencies. Reset in beforeEach so each
// test can wire its own behavior.
const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();
const cleanupFreshOrphanAuthUser = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
  cleanupFreshOrphanAuthUser: (...args) => cleanupFreshOrphanAuthUser(...args),
}));

const { POST } = await import('@/app/api/student/profile/route');

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
  cleanupFreshOrphanAuthUser.mockReset();
});

function fakeAuthedSupabase(rpcResult) {
  return { rpc: vi.fn(async () => rpcResult) };
}

function jsonRequest(body = {}, token = 'jwt') {
  return new Request('http://localhost/api/student/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FRESH_USER = () => ({
  id: 'auth-fresh',
  email: 'fresh@example.com',
  created_at: new Date().toISOString(),
});

describe('POST /api/student/profile — role-conflict cleanup', () => {
  it('returns 409 role_conflict and delegates to cleanupFreshOrphanAuthUser', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    getSupabaseWithToken.mockReturnValue(
      fakeAuthedSupabase({
        data: null,
        error: {
          code: '23505',
          message: 'Email fresh@example.com already registered as a landlord',
        },
      })
    );
    cleanupFreshOrphanAuthUser.mockResolvedValue(undefined);

    const res = await POST(jsonRequest({ display_name: 'Fresh' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'role_conflict', conflict_role: 'landlord' });
    expect(cleanupFreshOrphanAuthUser).toHaveBeenCalledTimes(1);
    // Asserts the route hands the full user object (so the helper can
    // check created_at) rather than a bare id.
    expect(cleanupFreshOrphanAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'auth-fresh' })
    );
  });

  it('does NOT call cleanup on non-role-conflict errors', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    getSupabaseWithToken.mockReturnValue(
      fakeAuthedSupabase({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      })
    );

    const res = await POST(jsonRequest({ display_name: 'Fresh' }));

    expect(res.status).toBe(500);
    expect(cleanupFreshOrphanAuthUser).not.toHaveBeenCalled();
  });

  it('returns 201 on the happy path and never touches cleanup', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    getSupabaseWithToken.mockReturnValue(
      fakeAuthedSupabase({
        data: { student_id: 'S99', email: 'fresh@example.com', display_name: 'Fresh' },
        error: null,
      })
    );

    const res = await POST(jsonRequest({ display_name: 'Fresh', preferred_locale: 'en' }));

    expect(res.status).toBe(201);
    expect(cleanupFreshOrphanAuthUser).not.toHaveBeenCalled();
  });
});
