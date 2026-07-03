import { describe, it, expect, vi, beforeEach } from 'vitest';

// The landlord profile route has TWO cleanup call sites:
//   1. The orphan-link path (link_orphan_landlord RPC raises 23505 via
//      the prevent_dual_role trigger's UPDATE-of-auth_user_id branch).
//   2. The new-insert path (INSERT raises 23505 via the BEFORE INSERT
//      branch).
// This file exercises both. Out of scope: the auto-numbering and
// orphan-landlord fixture seeding — those belong in their own suite.

const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();
const getSupabaseAsService = vi.fn();
const cleanupFreshOrphanAuthUser = vi.fn();
const getSupabase = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
  getSupabaseAsService: (...args) => getSupabaseAsService(...args),
  cleanupFreshOrphanAuthUser: (...args) => cleanupFreshOrphanAuthUser(...args),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));
vi.mock('@/lib/textNormalize', () => ({
  normalizeSingleLine: (s) => (typeof s === 'string' ? s.trim() : ''),
}));

const { POST } = await import('@/app/api/landlord/profile/route');

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
  getSupabaseAsService.mockReset();
  cleanupFreshOrphanAuthUser.mockReset();
  getSupabase.mockReset();
});

// Tiny fluent-builder mirroring the meUnread.test.js pattern, with
// terminal `.single()` used by the landlord route.
function table(terminal) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => terminal,
  };
  return chain;
}

// Migration 065: the `existing` and `orphan` reads select `email` (owner-only
// PII, no longer in the anon column allowlist) so the route runs them on the
// service-role client. Only the max-landlord_id auto-numbering read — which
// selects `landlord_id` alone — stays on the anon client.
function fakeServiceSupabase({ existing = null, orphan = null } = {}) {
  // getSupabaseAsService() is called once per read; returning this same object
  // both times lets the shared queue hand back existing, then orphan.
  const sequence = [
    table({ data: existing, error: existing ? null : { code: 'PGRST116' } }),
    table({ data: orphan, error: orphan ? null : { code: 'PGRST116' } }),
  ];
  return {
    from: vi.fn(() => sequence.shift() ?? table({ data: null, error: null })),
  };
}

function fakeAnonSupabase({ maxRow = null } = {}) {
  return {
    from: vi.fn(() => table({ data: maxRow ? [maxRow] : [], error: null })),
  };
}

const FRESH_USER = () => ({
  id: 'auth-fresh',
  email: 'fresh@example.com',
  created_at: new Date().toISOString(),
});

function jsonRequest(body = {}, token = 'jwt') {
  return new Request('http://localhost/api/landlord/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/landlord/profile — role-conflict cleanup', () => {
  it('orphan-link branch: returns 409 + delegates to cleanupFreshOrphanAuthUser', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    getSupabaseAsService.mockReturnValue(
      fakeServiceSupabase({
        orphan: { landlord_id: 'L42', email: 'fresh@example.com' },
      })
    );
    getSupabase.mockReturnValue(fakeAnonSupabase({}));
    getSupabaseWithToken.mockReturnValue({
      rpc: vi.fn(async () => ({
        error: {
          code: '23505',
          message: 'Email fresh@example.com already registered as a student',
        },
      })),
    });

    const res = await POST(jsonRequest({ name: 'Fresh Landlord' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'role_conflict', conflict_role: 'student' });
    expect(cleanupFreshOrphanAuthUser).toHaveBeenCalledTimes(1);
    expect(cleanupFreshOrphanAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'auth-fresh' })
    );
  });

  it('new-insert branch: returns 409 + delegates to cleanupFreshOrphanAuthUser', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    getSupabaseAsService.mockReturnValue(fakeServiceSupabase({}));
    getSupabase.mockReturnValue(fakeAnonSupabase({ maxRow: { landlord_id: '0041' } }));

    const insertChain = {
      insert: () => insertChain,
      select: () => insertChain,
      single: async () => ({
        data: null,
        error: {
          code: '23505',
          message: 'Email fresh@example.com already registered as a student',
        },
      }),
    };
    getSupabaseWithToken.mockReturnValue({
      from: vi.fn(() => insertChain),
    });

    const res = await POST(jsonRequest({ name: 'Fresh Landlord' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'role_conflict', conflict_role: 'student' });
    expect(cleanupFreshOrphanAuthUser).toHaveBeenCalledTimes(1);
    // Security regression (migration 065): the email-bearing existing/orphan
    // lookups must run on the service-role client, never the anon client.
    expect(getSupabaseAsService).toHaveBeenCalled();
  });
});
