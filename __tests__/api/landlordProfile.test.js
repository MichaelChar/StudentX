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
// textNormalize is NOT mocked: it is pure, and a mock that rejected
// non-strings hid that the real normalizer String()s them ("[object Object]").

const { POST, PATCH } = await import('@/app/api/landlord/profile/route');

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

/*
  Migration 112 changed link_orphan_landlord from `RETURNS void` to
  `RETURNS boolean`, because a zero-row UPDATE used to be indistinguishable
  from a successful claim — and the route answered `{ landlord }` either way.
  The guard that most often produces that zero-row case is the new
  `email_confirmed_at IS NOT NULL` check, i.e. exactly the account-takeover
  path in #246. These two tests pin both sides of the boolean.
*/
describe('POST /api/landlord/profile — orphan link honours the RPC result', () => {
  const ORPHAN = { landlord_id: 'L42', email: 'fresh@example.com' };

  function arrange(rpcResult) {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    getSupabase.mockReturnValue(fakeAnonSupabase({}));
    getSupabaseWithToken.mockReturnValue(
      fakeSelfSupabase({ orphan: ORPHAN, rpc: vi.fn(async () => rpcResult) })
    );
  }

  it('links the account when the RPC returns true', async () => {
    arrange({ data: true, error: null });

    const res = await POST(jsonRequest({ name: 'Fresh Landlord' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ landlord: ORPHAN });
  });

  it('403s when the RPC returns false — an unconfirmed email claims nothing', async () => {
    // No error is raised: the UPDATE simply matched no row. The old
    // `RETURNS void` shape made this look identical to success.
    arrange({ data: false, error: null });

    const res = await POST(jsonRequest({ name: 'Fresh Landlord' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'link_not_permitted' });
    // Not a role conflict, so no auth-user cleanup should be attempted.
    expect(cleanupFreshOrphanAuthUser).not.toHaveBeenCalled();
  });
});

/*
  `landlords.name` is public ("Listed by …" on cards and the PDP). The POST
  used to fall back to `user.email.split('@')[0]`, which published the local
  part of the landlord's email. A missing name is now a 400, and nothing is
  inserted.
*/
describe('POST /api/landlord/profile — name is required, never the email prefix', () => {
  function arrangeInsert() {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    getSupabase.mockReturnValue(fakeAnonSupabase({ maxRow: { landlord_id: '0041' } }));
    const insert = vi.fn(() => insertChain);
    const insertChain = {
      insert,
      select: () => insertChain,
      single: async () => ({ data: { landlord_id: '0042' }, error: null }),
    };
    getSupabaseWithToken.mockReturnValue(fakeSelfSupabase({ extra: insertChain }));
    return insert;
  }

  it.each([
    ['absent', {}],
    ['empty', { name: '' }],
    ['whitespace only', { name: '   ' }],
  ])('400s when the name is %s, and inserts nothing', async (_label, body) => {
    const insert = arrangeInsert();

    const res = await POST(jsonRequest(body));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name_required' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('400s on a name over 80 characters', async () => {
    const insert = arrangeInsert();

    const res = await POST(jsonRequest({ name: 'x'.repeat(81) }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'name_too_long' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts the supplied name, not anything derived from the email', async () => {
    const insert = arrangeInsert();

    const res = await POST(jsonRequest({ name: 'Maria Papadopoulou' }));

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.name).toBe('Maria Papadopoulou');
    expect(row.name).not.toBe('fresh');
  });
});

/*
  Migration 108 keeps `landlords.name` OUT of the `authenticated` UPDATE grant
  (only preferred_locale / profile_photo_url are granted), so a name write
  through the caller's token is a 42501 in prod. The route writes `name` with
  the service role, scoped by the JWT-derived user id — these tests pin both
  the client choice and the scoping, since a fake client can't see grants.
*/
describe('PATCH /api/landlord/profile — display name', () => {
  function patchRequest(body) {
    return new Request('http://localhost/api/landlord/profile', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function fakeWriter() {
    const update = vi.fn(() => chain);
    const eq = vi.fn(() => chain);
    const chain = {
      update,
      eq,
      select: () => chain,
      single: async () => ({
        data: { landlord_id: '0042', ...(update.mock.calls[0]?.[0] || {}) },
        error: null,
      }),
    };
    return { client: { from: vi.fn(() => chain) }, update, eq };
  }

  function arrange() {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue(FRESH_USER());
    const service = fakeWriter();
    const token = fakeWriter();
    getSupabaseAsService.mockReturnValue(service.client);
    getSupabaseWithToken.mockReturnValue(token.client);
    return { service, token };
  }

  it('writes the name with the service role, scoped to the JWT user — never the token client', async () => {
    const { service, token } = arrange();

    const res = await PATCH(patchRequest({ name: '  Maria   Papadopoulou ' }));

    expect(res.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith({ name: 'Maria Papadopoulou' });
    expect(service.eq).toHaveBeenCalledWith('auth_user_id', 'auth-fresh');
    expect(token.update).not.toHaveBeenCalled();
    expect((await res.json()).landlord.name).toBe('Maria Papadopoulou');
  });

  it('keeps photo-only updates on the caller token (granted column, RLS applies)', async () => {
    const { service, token } = arrange();

    const res = await PATCH(patchRequest({ profile_photo_url: null }));

    expect(res.status).toBe(200);
    expect(token.update).toHaveBeenCalledWith({ profile_photo_url: null });
    expect(getSupabaseAsService).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it('writes name + photo in ONE update so the pair cannot half-apply', async () => {
    const { service, token } = arrange();

    const res = await PATCH(patchRequest({ name: 'Maria', profile_photo_url: null }));

    expect(res.status).toBe(200);
    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith({ name: 'Maria', profile_photo_url: null });
    expect(token.update).not.toHaveBeenCalled();
  });

  it('500s cleanly when the service role is not configured', async () => {
    arrange();
    getSupabaseAsService.mockImplementation(() => {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PATCH(patchRequest({ name: 'Maria' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to update profile' });
    spy.mockRestore();
  });

  it.each([
    ['empty', '', 'name_required'],
    ['whitespace only', '   ', 'name_required'],
    ['null', null, 'name_required'],
    ['an object', {}, 'name_required'],
    ['a number', 42, 'name_required'],
    ['an array', ['Maria'], 'name_required'],
    ['over 80 characters', 'x'.repeat(81), 'name_too_long'],
  ])('400s on %s and writes nothing', async (_label, name, error) => {
    const { service, token } = arrange();

    const res = await PATCH(patchRequest({ name }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(service.update).not.toHaveBeenCalled();
    expect(token.update).not.toHaveBeenCalled();
  });
});
