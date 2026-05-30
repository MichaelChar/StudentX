import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks set up before SUT import; reset in beforeEach so each test wires
// its own behavior. Mirrors __tests__/api/meUnread.test.js.
const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
}));

const { GET, POST, DELETE } = await import('@/app/api/me/favorites/route');

// Fluent-builder mock for a supabase table. Terminal value resolves on
// await (via then) or maybeSingle(). Captures select/eq/insert/delete/order
// calls so tests can assert the route issued the right PostgREST query.
function table(terminalData) {
  const calls = { select: [], eq: [], insert: [], delete: [], order: [] };
  const chain = {
    calls,
    select: (...a) => { calls.select.push(a); return chain; },
    eq: (...a) => { calls.eq.push(a); return chain; },
    insert: (...a) => { calls.insert.push(a); return chain; },
    delete: (...a) => { calls.delete.push(a); return chain; },
    order: (...a) => { calls.order.push(a); return chain; },
    maybeSingle: () => Promise.resolve(terminalData),
    then: (onFulfilled) => Promise.resolve(terminalData).then(onFulfilled),
  };
  return chain;
}

// Build a supabase client whose students lookup + student_favorites table
// behave as configured. `student` = the row returned by the students probe
// (null → not a student). `favTerminal` = what the student_favorites chain
// resolves to (for insert/delete/select).
function client({ student = { student_id: 's-1' }, favTerminal = { data: [], error: null } } = {}) {
  const tables = {};
  const sb = {
    tables,
    from(name) {
      if (name === 'students') return table({ data: student });
      if (name === 'student_favorites') {
        tables.favorites = table(favTerminal);
        return tables.favorites;
      }
      throw new Error(`unexpected table: ${name}`);
    },
  };
  return sb;
}

// GET/DELETE read no body; POST reads request.json(). The route also reads
// request.url for the DELETE query param.
const req = ({ url = 'https://x/api/me/favorites', body } = {}) => ({
  headers: { get: () => null },
  url,
  json: () => Promise.resolve(body ?? {}),
});

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
});

describe('/api/me/favorites auth gating', () => {
  it('GET returns 401 when no token is present', async () => {
    extractToken.mockReturnValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(getUserFromToken).not.toHaveBeenCalled();
  });

  it('GET returns 401 when the token is invalid', async () => {
    extractToken.mockReturnValue('bad');
    getUserFromToken.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(getSupabaseWithToken).not.toHaveBeenCalled();
  });

  it('GET returns 401 when the caller is signed in but not a student', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-land' });
    getSupabaseWithToken.mockReturnValue(client({ student: null }));
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('POST returns 401 when not signed in as a student', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-land' });
    getSupabaseWithToken.mockReturnValue(client({ student: null }));
    const res = await POST(req({ body: { listing_id: '1234567' } }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me/favorites', () => {
  it('returns the student favourites and sets no-store', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    const rows = [
      { listing_id: '1234567', created_at: '2026-01-02T00:00:00Z' },
      { listing_id: '7654321', created_at: '2026-01-01T00:00:00Z' },
    ];
    const sb = client({ favTerminal: { data: rows, error: null } });
    getSupabaseWithToken.mockReturnValue(sb);

    const res = await GET(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ favorites: rows });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    // Scoped to the caller's student_id, newest first.
    expect(sb.tables.favorites.calls.eq).toEqual([['student_id', 's-1']]);
    expect(sb.tables.favorites.calls.order).toEqual([
      ['created_at', { ascending: false }],
    ]);
  });

  it('returns 500 when the favourites read errors', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    getSupabaseWithToken.mockReturnValue(
      client({ favTerminal: { data: null, error: { message: 'boom' } } }),
    );
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/me/favorites', () => {
  it('rejects a malformed listing_id with 400', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    getSupabaseWithToken.mockReturnValue(client());
    const res = await POST(req({ body: { listing_id: 'not-an-id' } }));
    expect(res.status).toBe(400);
  });

  it('inserts the favourite scoped to the caller and returns 201', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    const sb = client({ favTerminal: { error: null } });
    getSupabaseWithToken.mockReturnValue(sb);

    const res = await POST(req({ body: { listing_id: '1234567' } }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // student_id comes from the server-side students probe, never the body.
    expect(sb.tables.favorites.calls.insert).toEqual([
      [{ student_id: 's-1', listing_id: '1234567' }],
    ]);
  });

  it('treats a duplicate (unique violation) as idempotent success', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    getSupabaseWithToken.mockReturnValue(
      client({ favTerminal: { error: { code: '23505' } } }),
    );
    const res = await POST(req({ body: { listing_id: '1234567' } }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, already: true });
  });

  it('maps a foreign-key violation to 404 (listing missing)', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    getSupabaseWithToken.mockReturnValue(
      client({ favTerminal: { error: { code: '23503' } } }),
    );
    const res = await POST(req({ body: { listing_id: '1234567' } }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/me/favorites', () => {
  it('rejects a malformed listing_id with 400', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    getSupabaseWithToken.mockReturnValue(client());
    const res = await DELETE(req({ url: 'https://x/api/me/favorites?listing_id=nope' }));
    expect(res.status).toBe(400);
  });

  it('deletes the favourite scoped to caller + listing and returns ok', async () => {
    extractToken.mockReturnValue('t');
    getUserFromToken.mockResolvedValue({ id: 'u-1' });
    const sb = client({ favTerminal: { error: null } });
    getSupabaseWithToken.mockReturnValue(sb);

    const res = await DELETE(
      req({ url: 'https://x/api/me/favorites?listing_id=1234567' }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sb.tables.favorites.calls.delete).toEqual([[]]);
    expect(sb.tables.favorites.calls.eq).toEqual([
      ['student_id', 's-1'],
      ['listing_id', '1234567'],
    ]);
  });
});
