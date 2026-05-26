import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers before importing the SUT — the SUT awaits headers()
// at call time, so the mock just needs a settable cookieHeader.
let cookieHeader = '';
let tokenValue;
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name) => (name === 'cookie' ? cookieHeader : null),
  })),
  cookies: vi.fn(async () => ({
    get: (name) => (name === 'sb-access-token' && tokenValue ? { value: tokenValue } : undefined),
  })),
}));

// Mock the auth-cookies module so the test's expected cookie name is
// pinned regardless of future renames in the source.
vi.mock('@/lib/authCookies', () => ({
  SB_ACCESS_TOKEN_COOKIE: 'sb-access-token',
}));

// Mock supabaseServer so the requireStudent re-export in the same module
// doesn't try to hit a real Supabase instance during import.
vi.mock('@/lib/supabaseServer', () => ({
  getUserFromToken: vi.fn(async () => null),
  getSupabaseWithToken: vi.fn(),
}));

const { hasAuthCookie, requireStudent, requireLandlord } = await import('@/lib/requireStudent');
const supabaseServer = await import('@/lib/supabaseServer');

beforeEach(() => {
  cookieHeader = '';
  tokenValue = undefined;
  vi.mocked(supabaseServer.getUserFromToken).mockReset();
  vi.mocked(supabaseServer.getSupabaseWithToken).mockReset();
});

// Build a fake token-scoped supabase client. Supports both the
// `.select().eq().maybeSingle()` chain and the orphan-landlord email probe's
// `.select().ilike().limit().maybeSingle()` chain.
//
// A table fixture is either a row object (returned for any lookup) or a
// `{ byAuth, byEmail }` split so a test can make the auth_user_id lookup miss
// while the email lookup hits (the orphan-landlord case).
function buildFakeSupabase(fixtures) {
  return {
    from: (table) => {
      const entry = table in fixtures ? fixtures[table] : null;
      let mode = 'auth';
      const builder = {
        select: () => builder,
        eq: () => ((mode = 'auth'), builder),
        ilike: () => ((mode = 'email'), builder),
        limit: () => builder,
        maybeSingle: async () => {
          const split =
            entry && typeof entry === 'object' && ('byAuth' in entry || 'byEmail' in entry);
          const data = split ? (mode === 'email' ? entry.byEmail ?? null : entry.byAuth ?? null) : entry;
          return { data, error: null };
        },
      };
      return builder;
    },
  };
}

describe('hasAuthCookie', () => {
  it('returns false when no Cookie header is present', async () => {
    cookieHeader = '';
    expect(await hasAuthCookie()).toBe(false);
  });

  it('returns false when Cookie header has no sb-access-token', async () => {
    cookieHeader = 'theme=dark; consent=accepted';
    expect(await hasAuthCookie()).toBe(false);
  });

  it('returns true when sb-access-token is the only cookie', async () => {
    cookieHeader = 'sb-access-token=eyJhbGc';
    expect(await hasAuthCookie()).toBe(true);
  });

  it('returns true when sb-access-token is present alongside others', async () => {
    cookieHeader = 'theme=dark; sb-access-token=eyJhbGc; consent=accepted';
    expect(await hasAuthCookie()).toBe(true);
  });

  // Documented edge case in PR #64 review: a hypothetical cookie literally
  // named `xsb-access-token=...` would substring-match. Cost is one wasted
  // Supabase call (the authenticated branch returns null). Behavior pinned
  // here so a future stricter check is an intentional decision, not a
  // surprise regression.
  it('substring-matches xsb-access-token (known false-positive, harmless)', async () => {
    cookieHeader = 'xsb-access-token=somevalue';
    expect(await hasAuthCookie()).toBe(true);
  });
});

describe('requireStudent wrong-role shape', () => {
  it('returns the student row on the happy path', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-user-1',
      email: 'happy@example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({
        students: { student_id: 'S1', email: 'happy@example.com', display_name: 'Happy' },
      })
    );

    const auth = await requireStudent();
    expect(auth.student).toBeDefined();
    expect(auth.student.student_id).toBe('S1');
    expect(auth.kind).toBeUndefined();
  });

  it('returns wrong-role with conflict_role=landlord when the email is a landlord', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-user-2',
      email: 'duo@example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({
        students: null,
        landlords: { email: 'duo@example.com' },
      })
    );

    const auth = await requireStudent();
    expect(auth).toEqual({
      kind: 'wrong-role',
      conflict_role: 'landlord',
      email: 'duo@example.com',
    });
  });

  it('returns wrong-role with conflict_role=landlord for an orphan landlord matched by email', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-user-orphan',
      email: 'orphan-landlord@example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({
        students: null,
        // auth_user_id lookup misses (orphan row has NULL auth_user_id); the
        // email lookup is the one that finds it.
        landlords: { byAuth: null, byEmail: { email: 'orphan-landlord@example.com' } },
      })
    );

    const auth = await requireStudent();
    expect(auth).toEqual({
      kind: 'wrong-role',
      conflict_role: 'landlord',
      email: 'orphan-landlord@example.com',
    });
  });

  it('returns wrong-role with conflict_role=null when no role rows exist', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-user-3',
      email: 'orphan@example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({ students: null, landlords: null })
    );

    const auth = await requireStudent();
    expect(auth).toEqual({
      kind: 'wrong-role',
      conflict_role: null,
      email: 'orphan@example.com',
    });
  });
});

describe('requireLandlord wrong-role shape', () => {
  it('returns wrong-role with conflict_role=student when the email is a student', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-user-4',
      email: 'student@example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({
        landlords: null,
        students: { email: 'student@example.com' },
      })
    );

    const auth = await requireLandlord();
    expect(auth).toEqual({
      kind: 'wrong-role',
      conflict_role: 'student',
      email: 'student@example.com',
    });
  });
});
