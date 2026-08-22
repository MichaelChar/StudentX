import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSupabase = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));

const listingIdsBlockedInRange = vi.fn(async () => []);
vi.mock('@/lib/bookingBlocks', () => ({
  listingIdsBlockedInRange: (...args) => listingIdsBlockedInRange(...args),
}));

const { GET } = await import('@/app/api/listings/count-filtered/route');

beforeEach(() => {
  getSupabase.mockReset();
  listingIdsBlockedInRange.mockReset();
  listingIdsBlockedInRange.mockResolvedValue([]);
});

// A chainable PostgREST query-builder stub. Every filter method records its
// call (so tests can assert which WHERE clauses the route applied) and returns
// the builder; the builder is thenable, so `await query` resolves to `result`.
// `from()` returns a fresh builder per call (main + fallback queries) but they
// share one `calls` log. Pass `sequential` to give main vs fallback different
// results.
function fakeSupabase(result, { rpcResult, sequential } = {}) {
  const calls = [];
  let i = 0;
  const makeBuilder = () => {
    const b = {};
    const rec = (name) => (...args) => {
      calls.push([name, ...args]);
      return b;
    };
    for (const m of ['select', 'in', 'eq', 'neq', 'or', 'gte', 'lte', 'order']) {
      b[m] = rec(m);
    }
    b.then = (resolve, reject) => {
      const r = sequential ? sequential[Math.min(i++, sequential.length - 1)] : result;
      return Promise.resolve(r).then(resolve, reject);
    };
    return b;
  };
  return {
    from: vi.fn(() => makeBuilder()),
    rpc: vi.fn(async () => rpcResult || { data: null, error: null }),
    _calls: calls,
  };
}

function req(qs = '') {
  return { url: `http://localhost/api/listings/count-filtered${qs ? `?${qs}` : ''}` };
}

function selectCalls(supa) {
  return supa._calls.filter(([name]) => name === 'select');
}

describe('GET /api/listings/count-filtered', () => {
  it('returns { count } only, using head:true when every filter is query-side', async () => {
    const supa = fakeSupabase({ count: 7, data: null, error: null });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('types=Studio&neighborhoods=Kentro'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 7 });
    expect(Object.keys(body)).toEqual(['count']);

    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300');
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=86400');

    const selects = selectCalls(supa);
    expect(selects.length).toBe(1);
    expect(selects[0][2]).toEqual({ count: 'exact', head: true });
    expect(supa._calls).toContainEqual(['eq', 'listing_status', 'active']);
    expect(supa._calls).toContainEqual(['in', 'property_types.name', ['Studio']]);
    expect(supa._calls).toContainEqual(['in', 'location.neighborhood', ['Kentro']]);
  });

  it('applies budget — the deliberate divergence from price-distribution', async () => {
    const supa = fakeSupabase({ count: 2, data: null, error: null });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('min_budget=400&max_budget=800'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 2 });

    expect(supa._calls).toContainEqual(['gte', 'rent.monthly_price', 400]);
    expect(supa._calls).toContainEqual(['lte', 'rent.monthly_price', 800]);
  });

  it('applies verified_only + types alongside budget', async () => {
    const supa = fakeSupabase({ count: 1, data: null, error: null });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('types=Studio,1-Bedroom&verified_only=true&max_budget=600'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });

    const typeClause = supa._calls.find(
      ([name, col]) => name === 'in' && col === 'property_types.name',
    );
    expect(typeClause[2]).toEqual(['Studio', '1-Bedroom']);
    expect(supa._calls).toContainEqual(['eq', 'landlords.is_verified', true]);
    expect(supa._calls).toContainEqual(['lte', 'rent.monthly_price', 600]);
  });

  it('returns 400 on an invalid non-budget filter (shared validation)', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ count: 0, error: null }));
    const res = await GET(req('min_duration=7'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/min_duration/);
  });

  it('returns 400 on invalid budget, matching /api/listings', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ count: 0, error: null }));
    const minRes = await GET(req('min_budget=-5'));
    expect(minRes.status).toBe(400);
    expect((await minRes.json()).error).toMatch(/min_budget/);

    const maxRes = await GET(req('max_budget=abc'));
    expect(maxRes.status).toBe(400);
    expect((await maxRes.json()).error).toMatch(/max_budget/);
  });

  it('returns 500 when the query (and fallback) error', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ data: null, error: { message: 'boom' } }));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('returns count 0 when there are no matches', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ count: 0, data: null, error: null }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
  });

  it('short-circuits to 0 when the amenity RPC matches nothing', async () => {
    const supa = fakeSupabase(
      { count: 99, error: null },
      { rpcResult: { data: [], error: null } },
    );
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('exclude_amenities=Furnished'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
    // Never hit listings — the RPC already proved the set is empty.
    expect(supa.from).not.toHaveBeenCalled();
  });

  it('fetches lean rows (not head) when exclude_ground_floor needs the JS residual', async () => {
    const supa = fakeSupabase({
      data: [
        { listing_id: 'a', listing_amenities: [{ amenities: { name: 'WiFi' } }] },
        { listing_id: 'b', listing_amenities: [{ amenities: { name: 'Ground Floor' } }] },
      ],
      error: null,
    });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('exclude_ground_floor=true'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });

    const selects = selectCalls(supa);
    expect(selects.length).toBe(1);
    expect(selects[0][2]).toBeUndefined();
    expect(supa._calls).toContainEqual(['or', 'floor.is.null,floor.neq.0']);
  });

  it('applies the amenity AND-filter in JS when the RPC is down', async () => {
    const supa = fakeSupabase(
      {
        data: [
          { listing_id: 'f', listing_amenities: [{ amenities: { name: 'Furnished' } }] },
          { listing_id: 'w', listing_amenities: [{ amenities: { name: 'WiFi' } }] },
        ],
        error: null,
      },
      { rpcResult: { data: null, error: { message: 'rpc gone' } } },
    );
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('exclude_amenities=Furnished'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
    expect(selectCalls(supa)[0][2]).toBeUndefined();
  });

  it('applies stay-range blocked calendars + duration fit in JS', async () => {
    listingIdsBlockedInRange.mockResolvedValue(['blocked']);
    const supa = fakeSupabase({
      data: [
        { listing_id: 'ok', min_duration_months: 1, max_duration_months: 12 },
        { listing_id: 'blocked', min_duration_months: 1, max_duration_months: 12 },
        { listing_id: 'too-long-min', min_duration_months: 9, max_duration_months: 12 },
      ],
      error: null,
    });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('move_in=2026-09-01&move_out=2026-12-01'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
    expect(listingIdsBlockedInRange).toHaveBeenCalledWith('2026-09-01', '2026-12-01');
    expect(selectCalls(supa)[0][2]).toBeUndefined();
  });

  it('fail-closes to count 0 when verified_only cannot be honoured on fallback', async () => {
    const supa = fakeSupabase(null, {
      sequential: [
        { data: null, error: { message: 'column landlords.is_verified does not exist' } },
        { count: 4, data: null, error: null },
      ],
    });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('verified_only=true'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
    // Uncached — a half-migrated blip must not stick 0 on the CTA.
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('uses the fallback count when the primary SELECT fails for a non-verified filter', async () => {
    const supa = fakeSupabase(null, {
      sequential: [
        { data: null, error: { message: 'column landlords.is_verified does not exist' } },
        { count: 4, data: null, error: null },
      ],
    });
    getSupabase.mockReturnValue(supa);

    const res = await GET(req('types=Studio'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
    expect(selectCalls(supa).length).toBe(2);
    expect(selectCalls(supa)[1][2]).toEqual({ count: 'exact', head: true });
  });
});
