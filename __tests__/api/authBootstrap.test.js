import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SB_ACCESS_TOKEN_COOKIE } from '@/lib/authCookies';

// Hoisted mocks for the SUT's supabaseServer dependencies (#253).
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
}));

// The student branch defers provisioning through the Worker ExecutionContext.
// Force getExecutionCtx() → null so provisioning is awaited inline (the dev /
// no-Worker path) and its outcome is deterministic in the test. This also keeps
// @opennextjs/cloudflare out of the test import graph.
vi.mock('@/lib/cloudflareEnv', () => ({
  getExecutionCtx: () => null,
}));

const { POST } = await import('@/app/api/auth/bootstrap/route');

beforeEach(() => {
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
});

const USER = () => ({ id: 'auth-1', email: 'x@example.com', created_at: new Date().toISOString() });

function req(body, { raw } = {}) {
  return new Request('http://localhost/api/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

// supabase.rpc('create_student_profile', ...) → result
function rpcSupabase(result) {
  return { rpc: vi.fn(async () => result) };
}

// supabase.from(table).select().eq().maybeSingle() → { data, error: null }
function probeSupabase({ student = null, landlord = null } = {}) {
  const chain = (data) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
  });
  return {
    from: vi.fn((table) => (table === 'students' ? chain(student) : chain(landlord))),
  };
}

function cookieValue(res) {
  return res.cookies.get(SB_ACCESS_TOKEN_COOKIE)?.value;
}

describe('POST /api/auth/bootstrap — validation', () => {
  it('400 when access_token is missing', async () => {
    const res = await POST(req({ role: 'student' }));
    expect(res.status).toBe(400);
  });

  it('400 when role is missing or not student/landlord', async () => {
    expect((await POST(req({ access_token: 'jwt' }))).status).toBe(400);
    expect((await POST(req({ access_token: 'jwt', role: 'admin' }))).status).toBe(400);
  });

  it('400 on invalid JSON body', async () => {
    const res = await POST(req(null, { raw: 'not json{' }));
    expect(res.status).toBe(400);
  });

  it('401 when the token does not validate', async () => {
    getUserFromToken.mockResolvedValue(null);
    const res = await POST(req({ access_token: 'bad', role: 'student' }));
    expect(res.status).toBe(401);
    expect(cookieValue(res)).toBeUndefined();
  });
});

describe('POST /api/auth/bootstrap — student (cookie-first)', () => {
  it('200 + cookie on the happy path; provisioning runs, name is not echoed', async () => {
    getUserFromToken.mockResolvedValue(USER());
    const supa = rpcSupabase({ data: { student_id: 'S1', display_name: 'Foo' }, error: null });
    getSupabaseWithToken.mockReturnValue(supa);
    const res = await POST(req({ access_token: 'jwt', role: 'student' }));
    expect(res.status).toBe(200);
    // Cookie-first: the body no longer carries the display name (the client
    // never read it) — it only needs the cookie set before it navigates.
    expect(await res.json()).toEqual({ ok: true, role: 'student' });
    expect(cookieValue(res)).toBe('jwt');
    expect(supa.rpc).toHaveBeenCalledWith('create_student_profile', expect.any(Object));
  });

  it('landlord-in-student-form: still 200 + cookie (23505 conflict handled by the destination guard, not a 409 here)', async () => {
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(
      rpcSupabase({
        data: null,
        error: { code: '23505', message: 'Email x already registered as a landlord' },
      }),
    );
    const res = await POST(req({ access_token: 'jwt', role: 'student' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: 'student' });
    // Cookie is set; requireStudent on /student/account returns wrong-role and
    // redirects back to login with the conflict banner + email prefill.
    expect(cookieValue(res)).toBe('jwt');
  });

  it('a non-conflict RPC error no longer blocks login (deferred + logged, still 200 + cookie)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(
      rpcSupabase({ data: null, error: { code: '42501', message: 'permission denied' } }),
    );
    const res = await POST(req({ access_token: 'jwt', role: 'student' }));
    expect(res.status).toBe(200);
    expect(cookieValue(res)).toBe('jwt');
    expect(errSpy).toHaveBeenCalled(); // logged in the deferred provision
    errSpy.mockRestore();
  });
});

describe('POST /api/auth/bootstrap — landlord', () => {
  it('200 + cookie when a landlords row exists', async () => {
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(probeSupabase({ landlord: { name: 'LL Inc' } }));
    const res = await POST(req({ access_token: 'jwt', role: 'landlord' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, role: 'landlord', name: 'LL Inc' });
    expect(cookieValue(res)).toBe('jwt');
  });

  it('409 student-conflict + NO cookie when only a students row exists', async () => {
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(probeSupabase({ student: { display_name: 'Stu' } }));
    const res = await POST(req({ access_token: 'jwt', role: 'landlord' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'role_conflict', conflict_role: 'student' });
    expect(cookieValue(res)).toBeUndefined();
  });

  it('200 + cookie + role:null for an orphan (neither row)', async () => {
    getUserFromToken.mockResolvedValue(USER());
    getSupabaseWithToken.mockReturnValue(probeSupabase({}));
    const res = await POST(req({ access_token: 'jwt', role: 'landlord' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, role: null });
    expect(cookieValue(res)).toBe('jwt');
  });
});
