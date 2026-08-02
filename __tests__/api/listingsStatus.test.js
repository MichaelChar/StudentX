import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared PostgREST query-builder stub (same shape as priceDistribution tests)
// ---------------------------------------------------------------------------
function fakeSupabase(result) {
  const calls = [];
  const makeBuilder = () => {
    const b = {};
    const rec = (name) => (...args) => {
      calls.push([name, ...args]);
      return b;
    };
    for (const m of [
      'select',
      'in',
      'eq',
      'neq',
      'or',
      'gte',
      'lte',
      'order',
      'single',
      'maybeSingle',
    ]) {
      b[m] = rec(m);
    }
    b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return b;
  };
  return {
    from: vi.fn(() => makeBuilder()),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    _calls: calls,
  };
}

// ---------------------------------------------------------------------------
// Public list + detail
// ---------------------------------------------------------------------------
const getSupabase = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));

vi.mock('@/lib/listingFilters', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveRequiredAmenityIds: vi.fn(async () => ({
      listingIds: null,
      failed: false,
      empty: false,
    })),
  };
});

vi.mock('@/lib/bookingBlocks', () => ({
  listingIdsBlockedInRange: vi.fn(async () => []),
}));

const { GET: GET_LIST } = await import('@/app/api/listings/route');
const { GET: GET_DETAIL } = await import('@/app/api/listings/[id]/route');

beforeEach(() => {
  getSupabase.mockReset();
});

function listReq(qs = '') {
  return { url: `http://localhost/api/listings${qs ? `?${qs}` : ''}` };
}

function detailReq(id) {
  return {
    url: `http://localhost/api/listings/${id}`,
  };
}

describe('public listings honour listing_status', () => {
  it('filters the public list to listing_status = active (primary + fallback)', async () => {
    const supa = fakeSupabase({ data: [], error: null });
    getSupabase.mockReturnValue(supa);

    const res = await GET_LIST(listReq());
    expect(res.status).toBe(200);

    const statusEq = supa._calls.filter(
      ([name, col, val]) => name === 'eq' && col === 'listing_status' && val === 'active',
    );
    expect(statusEq.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 404 for a disabled listing on detail', async () => {
    // PostgREST .eq().single() with no match → PGRST116
    getSupabase.mockReturnValue(
      fakeSupabase({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    );

    const res = await GET_DETAIL(detailReq('0001001'), {
      params: Promise.resolve({ id: '0001001' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);

    const supa = getSupabase.mock.results[0].value;
    expect(supa._calls).toContainEqual(['eq', 'listing_status', 'active']);
    expect(supa._calls).toContainEqual(['eq', 'listing_id', '0001001']);
  });
});
