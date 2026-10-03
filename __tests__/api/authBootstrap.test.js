import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SB_ACCESS_TOKEN_COOKIE } from '@/lib/authCookies';

// Hoisted mocks for the SUT's supabaseServer dependencies (#253).
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
}));

const { POST } = await import('@/app/api/auth/bootstrap/route');

beforeEach(() => {
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
});

const USER = (metadata = {}) => ({
  id: 'auth-1',
  email: 'x@example.com',
  user_metadata: metadata,
});

function req(body, { raw } = {}) {
  return new Request('http://localhost/api/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

// Fake token-scoped client. Covers the three reads the route makes:
//   from(t).select().eq('auth_user_id').maybeSingle()           — row probes
//   from('landlords').select().is().ilike().maybeSingle()       — orphan probe
// plus rpc('create_student_profile').
function fakeSupabase({
  student = null,
  landlord = null,
  orphanLandlord = null,
  probeError = null,
  rpcResult = { data: {}, error: null },
} = {}) {
  const byAuthUser = (data) => ({
    maybeSingle: async () => ({ data: probeError ? null : data, error: probeError }),
  });
  const table = (name) => ({
    select: () => ({
      eq: () => byAuthUser(name === 'students' ? student : landlord),
      is: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: orphanLandlord, error: null }) }) }),
    }),
  });
  return {
    from: vi.fn(table),
    rpc: vi.fn(async () => rpcResult),
  };
}

function cookieValue(res) {
  return res.cookies.get(SB_ACCESS_TOKEN_COOKIE)?.value;
}

describe('POST /api/auth/bootstrap — validation', () => {
  it('400 when access_token is missing', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('400 on invalid JSON body', async () => {
    const res = await POST(req(null, { raw: 'not json{' }));
    expect(res.status).toBe(400);
  });

  it('401 when the token does not validate', async () => {
    getUserFromToken.mockResolvedValue(null);
    const res = await POST(req({ access_token: 'bad' }));
    expect(res.status).toBe(401);
    expect(cookieValue(res)).toBeUndefined();
  });

  it('no longer requires a role — the server detects it', async () => {
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(fakeSupabase({ student: { display_name: 'S' } }));
    const res = await POST(req({ access_token: 'jwt' }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/bootstrap — account with a role row', () => {
  it('landlords row → landlord + cookie', async () => {
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(fakeSupabase({ landlord: { name: 'LL Inc' } }));
    const res = await POST(req({ access_token: 'jwt' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: 'landlord', name: 'LL Inc' });
    expect(cookieValue(res)).toBe('jwt');
  });

  it('students row → student + cookie', async () => {
    getUserFromToken.mockResolvedValue(USER({ role: 'student' }));
    const supa = fakeSupabase({ student: { display_name: 'Stu' } });
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt' }));
    expect(await res.json()).toEqual({ ok: true, role: 'student' });
    expect(cookieValue(res)).toBe('jwt');
    // Row already exists — nothing to provision.
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it('ignores a role sent by the client (stale tab from the two-page era)', async () => {
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(fakeSupabase({ student: { display_name: 'Stu' } }));
    const res = await POST(req({ access_token: 'jwt', role: 'landlord' }));
    expect(await res.json()).toEqual({ ok: true, role: 'student' });
  });

  it('the row beats user_metadata: a landlord whose metadata says student is a landlord', async () => {
    // Real prod shape — started on the student form, ended up a landlord.
    getUserFromToken.mockResolvedValue(USER({ role: 'student' }));
    const supa = fakeSupabase({ landlord: { name: 'LL' } });
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt' }));
    expect((await res.json()).role).toBe('landlord');
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it('503 + NO cookie when the role probe errors — never read as "no row"', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getUserFromToken.mockResolvedValue(USER({ role: 'student' }));
    const supa = fakeSupabase({ probeError: { code: '500', message: 'boom' } });
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt' }));
    expect(res.status).toBe(503);
    expect(cookieValue(res)).toBeUndefined();
    expect(supa.rpc).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('POST /api/auth/bootstrap — account with no role row yet', () => {
  it('unclaimed landlord row for this email → landlord-incomplete, no student provisioning', async () => {
    getUserFromToken.mockResolvedValue(USER({ role: 'student' }));
    const supa = fakeSupabase({ orphanLandlord: { landlord_id: '0042' } });
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt' }));
    expect(await res.json()).toEqual({ ok: true, role: 'landlord-incomplete' });
    expect(cookieValue(res)).toBe('jwt');
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it('student signup missing its row → provisions it, student', async () => {
    getUserFromToken.mockResolvedValue(USER({ role: 'student' }));
    const supa = fakeSupabase();
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt' }));
    expect(await res.json()).toEqual({ ok: true, role: 'student' });
    expect(supa.rpc).toHaveBeenCalledWith('create_student_profile', expect.any(Object));
  });

  it('student provisioning hits prevent_dual_role (23505) → landlord-incomplete', async () => {
    getUserFromToken.mockResolvedValue(USER({ role: 'student' }));
    getSupabaseWithToken.mockReturnValue(
      fakeSupabase({
        rpcResult: { data: null, error: { code: '23505', message: 'already registered as a landlord' } },
      }),
    );
    const res = await POST(req({ access_token: 'jwt' }));
    expect((await res.json()).role).toBe('landlord-incomplete');
  });

  it('student provisioning fails otherwise → still student (logged; the guard re-probes)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getUserFromToken.mockResolvedValue(USER({ role: 'student' }));
    getSupabaseWithToken.mockReturnValue(
      fakeSupabase({ rpcResult: { data: null, error: { code: '42501', message: 'denied' } } }),
    );
    const res = await POST(req({ access_token: 'jwt' }));
    expect((await res.json()).role).toBe('student');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // The trap the unification had to avoid: the old student bootstrap created a
  // students row for ANY row-less account, which on a shared page would turn
  // every half-created landlord into a student for good (migration 036).
  it('no row and no student marker → landlord-incomplete, and NEVER provisions a student', async () => {
    getUserFromToken.mockResolvedValue(USER());
    const supa = fakeSupabase();
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt' }));
    expect(await res.json()).toEqual({ ok: true, role: 'landlord-incomplete' });
    expect(cookieValue(res)).toBe('jwt');
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it('new landlord signup (metadata role: landlord) → landlord-incomplete', async () => {
    getUserFromToken.mockResolvedValue(USER({ role: 'landlord', display_name: 'Anna' }));
    const supa = fakeSupabase();
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt' }));
    expect((await res.json()).role).toBe('landlord-incomplete');
    expect(supa.rpc).not.toHaveBeenCalled();
  });
});
