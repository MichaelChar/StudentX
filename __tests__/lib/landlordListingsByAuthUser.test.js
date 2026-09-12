import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  `/api/landlord/listings` used to fetch landlord_id and THEN the listings, two
  sequential Supabase round-trips. selectLandlordListingsByAuthUser collapses
  that into one by filtering on the embedded landlords row.

  What must not regress:

  1. THE FILTER. `listings` carries a SELECT policy of `Public can read
     listings` with USING (true) for every role — RLS does NOT scope listing
     reads to their owner. This filter is the only thing between a landlord and
     everyone else's listings, so a test pins that it is actually applied, and
     applied to the embedded column rather than something weaker.
  2. THE JOIN IS INNER. An optional embed would return non-matching listings
     with a null embed instead of excluding them — same leak, quieter.
  3. THE SHAPE. The embed is a join artefact, not data. It must be stripped so
     callers see exactly what selectLandlordListings returns.
  4. THE FALLBACK. The pre-migration retry must keep both the filter and the
     join; dropping either on the error path would leak only when a column is
     missing, which is the worst possible time to find out.
*/

let primaryResult;
let fallbackResult;
let calls;

function makeSupabase() {
  calls = [];
  let call = 0;
  return {
    from(table) {
      const rec = { table, select: null, eq: [], order: null };
      calls.push(rec);
      const builder = {
        select(cols) {
          rec.select = cols;
          return builder;
        },
        eq(col, val) {
          rec.eq.push([col, val]);
          return builder;
        },
        order(col, opts) {
          rec.order = [col, opts];
          // Resolve as a thenable, like a PostgREST query builder.
          const out = call === 0 ? primaryResult : fallbackResult;
          call += 1;
          return Promise.resolve(out);
        },
      };
      return builder;
    },
  };
}

const { selectLandlordListingsByAuthUser } = await import(
  '@/lib/landlordListingSelect'
);

beforeEach(() => {
  primaryResult = { data: [], error: null };
  fallbackResult = { data: [], error: null };
  vi.restoreAllMocks();
});

describe('selectLandlordListingsByAuthUser', () => {
  it('filters on the EMBEDDED landlords column, not on listings', async () => {
    await selectLandlordListingsByAuthUser(makeSupabase(), 'auth-uuid-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('listings');
    expect(calls[0].eq).toEqual([['landlords.auth_user_id', 'auth-uuid-1']]);
  });

  it('joins landlords with !inner so non-matching rows are excluded, not nulled', async () => {
    await selectLandlordListingsByAuthUser(makeSupabase(), 'auth-uuid-1');
    expect(calls[0].select).toMatch(/landlords!inner\s*\(\s*auth_user_id\s*\)/);
  });

  it('strips the join-only embed so the row shape is unchanged', async () => {
    primaryResult = {
      data: [
        { listing_id: '1', title: 'A', landlords: { auth_user_id: 'auth-uuid-1' } },
        { listing_id: '2', title: 'B', landlords: { auth_user_id: 'auth-uuid-1' } },
      ],
      error: null,
    };
    const { data } = await selectLandlordListingsByAuthUser(makeSupabase(), 'auth-uuid-1');
    expect(data).toEqual([
      { listing_id: '1', title: 'A' },
      { listing_id: '2', title: 'B' },
    ]);
    expect(data.every((r) => !('landlords' in r))).toBe(true);
  });

  it('orders newest first', async () => {
    await selectLandlordListingsByAuthUser(makeSupabase(), 'auth-uuid-1');
    expect(calls[0].order).toEqual(['created_at', { ascending: false }]);
  });

  it('retries on the pre-migration fallback KEEPING the filter and the join', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    primaryResult = { data: null, error: { message: 'column does not exist' } };
    fallbackResult = { data: [{ listing_id: '9', landlords: { auth_user_id: 'u' } }], error: null };

    const { data } = await selectLandlordListingsByAuthUser(makeSupabase(), 'auth-uuid-1');

    expect(calls).toHaveLength(2);
    // The leak-shaped regression: a fallback that forgets either half.
    expect(calls[1].eq).toEqual([['landlords.auth_user_id', 'auth-uuid-1']]);
    expect(calls[1].select).toMatch(/landlords!inner/);
    expect(data).toEqual([{ listing_id: '9' }]);
  });

  it('passes a query error straight through without touching data', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    primaryResult = { data: null, error: { message: 'boom' } };
    fallbackResult = { data: null, error: { message: 'boom again' } };
    const res = await selectLandlordListingsByAuthUser(makeSupabase(), 'auth-uuid-1');
    expect(res.error).toEqual({ message: 'boom again' });
  });
});
