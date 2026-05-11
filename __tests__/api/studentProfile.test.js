import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for the SUT's dependencies. Reset in beforeEach so each
// test can wire its own behavior.
const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();
const deleteAuthUserAsService = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
  deleteAuthUserAsService: (...args) => deleteAuthUserAsService(...args),
}));

const { POST } = await import('@/app/api/student/profile/route');

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
  deleteAuthUserAsService.mockReset();
});

// Build a fake authedSupabase whose .rpc() returns the supplied result.
// The route only invokes .rpc('create_student_profile', ...), so a single
// shared implementation is enough.
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

describe('POST /api/student/profile — role-conflict cleanup', () => {
  it('returns 409 role_conflict and deletes the freshly-created auth user', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue({
      id: 'auth-fresh',
      email: 'fresh@example.com',
      // 30 seconds old — well within the 5-min fresh window
      created_at: new Date(Date.now() - 30_000).toISOString(),
    });
    getSupabaseWithToken.mockReturnValue(
      fakeAuthedSupabase({
        data: null,
        error: {
          code: '23505',
          message:
            'Email fresh@example.com already registered as a landlord; one email cannot be both',
        },
      })
    );
    deleteAuthUserAsService.mockResolvedValue({ data: null, error: null });

    const res = await POST(jsonRequest({ display_name: 'Fresh' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'role_conflict', conflict_role: 'landlord' });
    expect(deleteAuthUserAsService).toHaveBeenCalledTimes(1);
    expect(deleteAuthUserAsService).toHaveBeenCalledWith('auth-fresh');
  });

  it('does NOT delete the auth user when it was created long ago (defensive)', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue({
      id: 'auth-old',
      email: 'old@example.com',
      // 10 days old — outside the 5-min fresh window
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    getSupabaseWithToken.mockReturnValue(
      fakeAuthedSupabase({
        data: null,
        error: {
          code: '23505',
          message: 'Email already registered as a landlord',
        },
      })
    );

    const res = await POST(jsonRequest({ display_name: 'Old' }));

    expect(res.status).toBe(409);
    expect(deleteAuthUserAsService).not.toHaveBeenCalled();
  });

  it('does NOT delete on non-role-conflict errors', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue({
      id: 'auth-fresh',
      email: 'fresh@example.com',
      created_at: new Date().toISOString(),
    });
    getSupabaseWithToken.mockReturnValue(
      fakeAuthedSupabase({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      })
    );

    const res = await POST(jsonRequest({ display_name: 'Fresh' }));

    expect(res.status).toBe(500);
    expect(deleteAuthUserAsService).not.toHaveBeenCalled();
  });

  it('returns 201 on the happy path and never touches the admin API', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue({
      id: 'auth-fresh',
      email: 'fresh@example.com',
      created_at: new Date().toISOString(),
    });
    getSupabaseWithToken.mockReturnValue(
      fakeAuthedSupabase({
        data: { student_id: 'S99', email: 'fresh@example.com', display_name: 'Fresh' },
        error: null,
      })
    );

    const res = await POST(jsonRequest({ display_name: 'Fresh', preferred_locale: 'en' }));

    expect(res.status).toBe(201);
    expect(deleteAuthUserAsService).not.toHaveBeenCalled();
  });
});
