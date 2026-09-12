import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSupabase = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));

const { GET } = await import('@/app/api/listings/count/route');

beforeEach(() => {
  getSupabase.mockReset();
});

// Chainable PostgREST stub. Records every call so a test can assert which
// WHERE clauses the route applied, and is thenable so `await query` resolves.
function fakeSupabase(result) {
  const calls = [];
  const b = {};
  const rec = (name) => (...args) => {
    calls.push([name, ...args]);
    return b;
  };
  for (const m of ['select', 'eq', 'order']) b[m] = rec(m);
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return { from: vi.fn(() => b), _calls: calls };
}

describe('GET /api/listings/count', () => {
  it("counts only listing_status = 'active'", async () => {
    // The regression this guards: the route had no status clause, so the
    // landing tile counted drafts and paused listings as available housing.
    const supa = fakeSupabase({ count: 3, error: null });
    getSupabase.mockReturnValue(supa);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ count: 3 });

    expect(supa._calls).toContainEqual(['eq', 'listing_status', 'active']);
  });

  it('asks Postgres for a count and no rows', async () => {
    const supa = fakeSupabase({ count: 0, error: null });
    getSupabase.mockReturnValue(supa);

    await GET();

    expect(supa._calls).toContainEqual([
      'select',
      '*',
      { count: 'exact', head: true },
    ]);
  });

  it('sets the public edge-cache header', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ count: 7, error: null }));

    const res = await GET();

    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=86400',
    );
  });

  it('500s on a query error rather than reporting a count of 0', async () => {
    getSupabase.mockReturnValue(
      fakeSupabase({ count: null, error: { message: 'boom' } }),
    );

    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('reports 0 when the count comes back null', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ count: null, error: null }));

    const res = await GET();
    await expect(res.json()).resolves.toEqual({ count: 0 });
  });
});
