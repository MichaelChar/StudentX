import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  The "Similar listings" rail used to be fetched as getSimilarListings(listing)
  — i.e. it could not start until getListingForRender had resolved. On a
  force-dynamic PDP that serialised two Supabase round-trips into the TTFB.

  The split these tests guard: the QUERY takes only the listing ID, so the page
  can fire it in parallel with the main listing read, and the RANKING (which
  genuinely needs the resolved listing) stays pure and synchronous.

  The thing that must not regress is the correctness of that split — that the
  candidate query still excludes the current listing and still pins active-only,
  and that ranking tolerates being handed a null/absent listing, which is now
  reachable because the query no longer waits to find out whether one exists.
*/

let rows;
let queryError = null;
const limit = vi.fn(async () => ({ data: rows, error: queryError }));
const neq = vi.fn(() => ({ limit }));
const eq = vi.fn(() => ({ neq }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ from }) }));
vi.mock('@/lib/transformListing', () => ({
  transformListing: (r) => ({ ...r }),
}));
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return { ...actual, cache: (fn) => fn }; // defeat per-request memoisation
});

const { getSimilarCandidates, rankSimilarCandidates } = await import(
  '@/lib/listingForRender'
);

beforeEach(() => {
  rows = [];
  queryError = null;
  vi.clearAllMocks();
});

describe('getSimilarCandidates — the parallelisable half', () => {
  it('queries on the ID alone, pinning active and excluding the current listing', async () => {
    rows = [{ listing_id: '2', neighborhood: 'Kamara', monthly_price: 400 }];
    const out = await getSimilarCandidates('0106002');

    expect(from).toHaveBeenCalledWith('listings');
    expect(eq).toHaveBeenCalledWith('listing_status', 'active');
    expect(neq).toHaveBeenCalledWith('listing_id', '0106002');
    expect(out).toHaveLength(1);
  });

  it('returns [] without querying when no ID is given', async () => {
    expect(await getSimilarCandidates(undefined)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('degrades to [] on a query error rather than throwing into the render', async () => {
    queryError = { message: 'boom' };
    expect(await getSimilarCandidates('0106002')).toEqual([]);
  });
});

describe('rankSimilarCandidates — the half that needs the listing', () => {
  it('ranks same-neighbourhood first, then nearest price', () => {
    const candidates = [
      { listing_id: '2', neighborhood: 'Toumba', monthly_price: 460 },
      { listing_id: '3', neighborhood: 'Kamara', monthly_price: 700 },
      { listing_id: '4', neighborhood: 'Kamara', monthly_price: 480 },
    ];
    const current = { listing_id: '1', neighborhood: 'Kamara', monthly_price: 450 };

    expect(rankSimilarCandidates(candidates, current).map((r) => r.listing_id)).toEqual([
      '4',
      '3',
      '2',
    ]);
  });

  it('returns [] when the listing came back null (404 raced the candidate query)', () => {
    const candidates = [{ listing_id: '2', neighborhood: 'Kamara', monthly_price: 400 }];
    expect(rankSimilarCandidates(candidates, null)).toEqual([]);
  });

  it('returns [] when the candidate pool is not an array', () => {
    expect(rankSimilarCandidates(undefined, { listing_id: '1' })).toEqual([]);
  });
});
