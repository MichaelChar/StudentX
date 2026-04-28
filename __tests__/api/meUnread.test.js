import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks set up before SUT import. These are reset in beforeEach so each
// test can wire its own behavior.
const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();
const getSupabase = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));

const { GET } = await import('@/app/api/me/unread/route');

// Tiny fluent-builder mock for supabase client tables. Returns a chainable
// object whose terminal `maybeSingle()` / awaited await resolves to the
// data we wire up. The shape mirrors PostgREST: from().select().eq()...
function table(terminalData) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(terminalData),
    then: (onFulfilled) => Promise.resolve(terminalData).then(onFulfilled),
  };
  return chain;
}

const fakeRequest = (token = 'fake-token') => ({ token });

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
  getSupabase.mockReset();
});

describe('GET /api/me/unread', () => {
  it('returns count=0 + role=null when no token is present', async () => {
    extractToken.mockReturnValue(null);
    const res = await GET(fakeRequest(null));
    const json = await res.json();
    expect(json).toEqual({ count: 0, role: null });
    expect(getUserFromToken).not.toHaveBeenCalled();
  });

  it('returns count=0 + role=null when token is invalid (user lookup fails)', async () => {
    extractToken.mockReturnValue('bad-token');
    getUserFromToken.mockResolvedValue(null);
    const res = await GET(fakeRequest('bad-token'));
    const json = await res.json();
    expect(json).toEqual({ count: 0, role: null });
    expect(getSupabaseWithToken).not.toHaveBeenCalled();
  });

  it('aggregates student_unread_count when caller is a student', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'user-123' });
    getSupabaseWithToken.mockReturnValue({
      from: (tableName) => {
        if (tableName === 'students') {
          return table({ data: { student_id: 's-1' } });
        }
        if (tableName === 'inquiries') {
          return table({
            data: [
              { student_unread_count: 2 },
              { student_unread_count: 3 },
              { student_unread_count: 0 },
            ],
          });
        }
        throw new Error(`unexpected table: ${tableName}`);
      },
    });

    const res = await GET(fakeRequest());
    const json = await res.json();
    expect(json).toEqual({ count: 5, role: 'student' });
    // Non-student fallback path should not be invoked.
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it('aggregates landlord_unread_count via listings join when caller is a landlord', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'user-456' });
    getSupabaseWithToken.mockReturnValue({
      from: (tableName) => {
        if (tableName === 'students') {
          // Not a student — return empty studentRow.
          return table({ data: null });
        }
        if (tableName === 'inquiries') {
          return table({
            data: [
              { landlord_unread_count: 1 },
              { landlord_unread_count: 4 },
            ],
          });
        }
        throw new Error(`unexpected authed table: ${tableName}`);
      },
    });
    getSupabase.mockReturnValue({
      from: (tableName) => {
        if (tableName === 'landlords') {
          return table({ data: { landlord_id: 'l-1' } });
        }
        throw new Error(`unexpected unauthed table: ${tableName}`);
      },
    });

    const res = await GET(fakeRequest());
    const json = await res.json();
    expect(json).toEqual({ count: 5, role: 'landlord' });
  });

  it('returns count=0 + role=null when caller is neither student nor landlord', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'user-999' });
    getSupabaseWithToken.mockReturnValue({
      from: () => table({ data: null }),
    });
    getSupabase.mockReturnValue({
      from: () => table({ data: null }),
    });

    const res = await GET(fakeRequest());
    const json = await res.json();
    expect(json).toEqual({ count: 0, role: null });
  });

  it('handles null/missing unread_count fields gracefully (treats as 0)', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u' });
    getSupabaseWithToken.mockReturnValue({
      from: (tableName) =>
        tableName === 'students'
          ? table({ data: { student_id: 's' } })
          : table({
              data: [
                { student_unread_count: null },
                { student_unread_count: undefined },
                { student_unread_count: 7 },
              ],
            }),
    });

    const res = await GET(fakeRequest());
    const json = await res.json();
    expect(json).toEqual({ count: 7, role: 'student' });
  });

  it('sets private/no-store cache header on the response', async () => {
    extractToken.mockReturnValue(null);
    const res = await GET(fakeRequest(null));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
