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

// Build a fake token-scoped supabase client whose chained
// `.from(table).select().eq().maybeSingle()` returns the table-keyed
// fixture. Used by both requireStudent and requireLandlord tests.
function buildFakeSupabase(fixtures) {
  return {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: fixtures[table] ?? null, error: null }),
        }),
        // The orphan-landlord probe (issue #148) is a SECOND query on the
        // same table with a different shape: .is('auth_user_id', null)
        // .ilike('email', …). It reads a separately-keyed fixture so a test
        // can hand back nothing for the auth_user_id lookup and an orphan
        // row for the email one — which is exactly the state that produced
        // the silent bounce.
        is: () => ({
          ilike: () => ({
            maybeSingle: async () => ({
              data: fixtures[`${table}:orphan`] ?? null,
              error: null,
            }),
          }),
        }),
      }),
    }),
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

/*
  Issue #148. A landlords row can exist with auth_user_id = NULL — curated
  or seeded rows waiting to be claimed — and the wrong-role probe only
  looked up by auth_user_id, so conflict_role came back null, the redirect
  carried no ?roleConflict, and the login page rendered a bare form.

  Note the reported reproduction (student signup blocked by an orphan
  landlord) no longer occurs: migration 067 added an `auth_user_id IS NOT
  NULL` guard to handle_new_student_user, so that signup now creates the
  students row. The bug survives via a different route — sign up as a
  LANDLORD, so no students row exists, then hit a student-guarded page
  before completing the profile that links the orphan row.
*/
describe('requireStudent orphan-landlord conflict (#148)', () => {
  it('reports landlord-orphan when only an unlinked landlord row matches the email', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-1',
      email: 'Owner@Example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({
        students: null,
        landlords: null, // the auth_user_id lookup finds nothing…
        'landlords:orphan': { email: 'owner@example.com', auth_user_id: null }, // …the email one does
      })
    );

    const res = await requireStudent();

    // NOT plain 'landlord': that CTA sends them to a password form for an
    // account with no auth.users linkage, which can never succeed.
    expect(res).toEqual({
      kind: 'wrong-role',
      conflict_role: 'landlord-orphan',
      email: 'owner@example.com',
    });
  });

  it('still reports plain landlord when the row IS linked', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-1',
      email: 'owner@example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({
        students: null,
        landlords: { email: 'owner@example.com', auth_user_id: 'auth-1' },
      })
    );

    expect(await requireStudent()).toEqual({
      kind: 'wrong-role',
      conflict_role: 'landlord',
      email: 'owner@example.com',
    });
  });

  it('reports null when neither a linked nor an orphan landlord matches', async () => {
    cookieHeader = 'sb-access-token=jwt';
    tokenValue = 'jwt';
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({
      id: 'auth-1',
      email: 'nobody@example.com',
    });
    vi.mocked(supabaseServer.getSupabaseWithToken).mockReturnValue(
      buildFakeSupabase({ students: null, landlords: null })
    );

    expect(await requireStudent()).toEqual({
      kind: 'wrong-role',
      conflict_role: null,
      email: 'nobody@example.com',
    });
  });
});
