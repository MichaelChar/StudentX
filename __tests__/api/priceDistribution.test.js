import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the anon Supabase client the route uses. Each test wires the resolved
// `.from(...).select(...)` result.
const getSupabase = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));

const { GET } = await import('@/app/api/listings/price-distribution/route');

beforeEach(() => {
  getSupabase.mockReset();
});

// Minimal chainable stub: getSupabase().from(...).select(...) resolves `result`.
function fakeSupabase(result) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(async () => result),
    })),
  };
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

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prices).toEqual([400, 850, 600]);
    // Cacheable at the edge — distribution is identical for every visitor.
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300');
  });

  it('does NOT apply any budget filter (returns prices across the full range)', async () => {
    getSupabase.mockReturnValue(
      fakeSupabase({
        data: [{ rent: { monthly_price: 300 } }, { rent: { monthly_price: 2000 } }],
        error: null,
      })
    );

    const res = await GET();
    const body = await res.json();
    // Both the cheap and the well-above-typical-budget listing come back.
    expect(body.prices).toEqual([300, 2000]);
  });

  it('returns 500 when the query errors', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ data: null, error: { message: 'boom' } }));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns an empty array when there are no listings', async () => {
    getSupabase.mockReturnValue(fakeSupabase({ data: [], error: null }));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prices).toEqual([]);
  });
});
