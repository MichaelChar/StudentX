import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the anon Supabase client the route uses.
const getSupabase = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));

const { GET } = await import('@/app/api/listings/price-distribution/route');

beforeEach(() => {
  getSupabase.mockReset();
});

// A chainable PostgREST query-builder stub. Every filter method records its
// call (so tests can assert which WHERE clauses the route applied) and returns
// the builder; the builder is thenable, so `await query` resolves to `result`.
// `from()` returns a fresh builder per call (main + fallback queries) but they
// share one `calls` log and resolve to the same `result`.
function fakeSupabase(result, { rpcResult } = {}) {
  const calls = [];
  const makeBuilder = () => {
    const b = {};
    const rec = (name) => (...args) => {
      calls.push([name, ...args]);
      return b;
    };
    for (const m of ['select', 'in', 'eq', 'neq', 'or', 'gte', 'lte', 'order']) {
      b[m] = rec(m);
    }
    b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return b;
  };
  return {
    from: vi.fn(() => makeBuilder()),
    rpc: vi.fn(async () => rpcResult || { data: null, error: null }),
    _calls: calls,
  };
}

// Build a Request-like object for the route's `new URL(request.url)`.
function req(qs = '') {
  return { url: `http://localhost/api/listings/price-distribution${qs ? `?${qs}` : ''}` };
}

describe('GET /api/listings/price-distribution', () => {
  it('returns only numeric prices, dropping null/non-number and handling both rent shapes', async () => {
    getSupabase.mockReturnValue(
      fakeSupabase({
        data: [
          { rent: { monthly_price: 400 } },
          { rent: { monthly_price: 850 } },
          { rent: [{ monthly_price: 600 }] }, // PostgREST array shape
          { rent: { monthly_price: null } }, // dropped
          { rent: null }, // dropped
          { rent: { monthly_price: 'NaN' } }, // dropped (non-number)
        ],
        error: null,
      })
    );

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prices).toEqual([400, 850, 600]);
    // Cacheable at the edge (per filter-combo).
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300');
  });

  it('does NOT apply any budget filter — budget params are ignored', async () => {
    const supa = fakeSupabase({
      data: [{ rent: { monthly_price: 300 } }, { rent: { monthly_price: 2000 } }],
      error: null,
    });
    getSupabase.mockReturnValue(supa);

    // Pass budget params that would normally constrain the result.
    const res = await GET(req('max_budget=500&min_budget=400'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Both the cheap and the well-above-budget listing come back unfiltered.
    expect(body.prices).toEqual([300, 2000]);
    // And no monthly_price range clause was ever pushed to the query.
    const budgetClauses = supa._calls.filter(
      ([name, col]) => (name === 'gte' || name === 'lte') && col === 'rent.monthly_price'
    );
    expect(budgetClauses).toEqual([]);
  });

  it('applies a non-budget filter — neighborhoods narrows the query', async () => {
    // Mock returns the already-narrowed subset the DB would for ?neighborhoods=Kentro.
    const supa = fakeSupabase({
      data: [{ rent: { monthly_price: 420 } }, { rent: { monthly_price: 560 } }],
      error: null,
    });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('neighborhoods=Kentro'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prices).toEqual([420, 560]);

    // The route translated the param into the matching PostgREST clause.
    const neighborhoodClause = supa._calls.find(
      ([name, col]) => name === 'in' && col === 'location.neighborhood'
    );
    expect(neighborhoodClause).toBeTruthy();
    expect(neighborhoodClause[2]).toEqual(['Kentro']);
  });

  it('applies type + verified filters alongside ignoring budget', async () => {
    const supa = fakeSupabase({
      data: [{ rent: { monthly_price: 700 } }],
      error: null,
    });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('types=Studio,1-Bedroom&verified_only=true&max_budget=600'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prices).toEqual([700]); // above the 600 budget, still present

    const typeClause = supa._calls.find(
      ([name, col]) => name === 'in' && col === 'property_types.name'
    );
    expect(typeClause[2]).toEqual(['Studio', '1-Bedroom']);
    // verified_only → both verified clauses applied
    expect(supa._calls).toContainEqual(['neq', 'landlords.verified_tier', 'none']);
    expect(supa._calls).toContainEqual(['eq', 'landlords.is_verified', true]);
    // budget never applied
    expect(supa._calls.some(([name]) => name === 'gte' || name === 'lte')).toBe(false);
  });

  it('returns 400 on an invalid non-budget filter (shared validation)', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ data: [], error: null }));
    const res = await GET(req('min_duration=7'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/min_duration/);
  });

  it('returns 500 when the query (and fallback) error', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ data: null, error: { message: 'boom' } }));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('returns an empty array when there are no listings', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ data: [], error: null }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prices).toEqual([]);
  });
});
