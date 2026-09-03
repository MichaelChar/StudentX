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

/*
  The `existing` and `orphan` reads select `email` and `onboarding_completed`,
  which migration 065 removed from the ANON column allowlist. They therefore
  must not run on the anon client — that part of the original note stands.

  What changed: they run on the CALLER'S TOKEN, not the service-role key.
  `authenticated` kept SELECT on all three of `email`, `onboarding_completed`
  and `auth_user_id`; only `anon` lost them. The service-role key was never
  required, and depending on it made this route 500 in any environment without
  that secret.

  `extra` serves the calls that follow the two reads — the insert branch, which
  goes through the same token-scoped client.
*/
function fakeSelfSupabase({ existing = null, orphan = null, extra = null, rpc } = {}) {
  const sequence = [
    table({ data: existing, error: existing ? null : { code: 'PGRST116' } }),
    table({ data: orphan, error: orphan ? null : { code: 'PGRST116' } }),
  ];
  const client = {
    from: vi.fn(() => sequence.shift() ?? extra ?? table({ data: null, error: null })),
  };
  if (rpc) client.rpc = rpc;
  return client;
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
    getSupabase.mockReturnValue(fakeAnonSupabase({}));
    getSupabaseWithToken.mockReturnValue(
      fakeSelfSupabase({
        orphan: { landlord_id: 'L42', email: 'fresh@example.com' },
        rpc: vi.fn(async () => ({
          error: {
            code: '23505',
            message: 'Email fresh@example.com already registered as a student',
          },
        })),
      })
    );

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
    getSupabaseWithToken.mockReturnValue(fakeSelfSupabase({ extra: insertChain }));

    const res = await POST(jsonRequest({ name: 'Fresh Landlord' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'role_conflict', conflict_role: 'student' });
    expect(cleanupFreshOrphanAuthUser).toHaveBeenCalledTimes(1);
    /*
      Security regression (migration 065): the email-bearing existing/orphan
      lookups must never run on the ANON client, which has no SELECT on
      `email`. They run on the caller's own token — `authenticated` kept that
      grant — and the service-role key is not involved at all.
    */
    expect(getSupabaseWithToken).toHaveBeenCalledWith('jwt');
    expect(getSupabaseAsService).not.toHaveBeenCalled();
  });
});
