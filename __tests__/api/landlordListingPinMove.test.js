import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  PATCH /api/landlord/listings/[id]: distances after a pin move (#573 follow-up).

  The route commits the new pin, deletes the listing's walk-time rows, and
  re-measures both distance tables in after(). The bug this guards: after()
  used to be registered only at the END of the handler, so an early return
  (a bad property type, a failed listings UPDATE) after the pin was committed
  skipped the re-measure. It was then skipped forever, because the next save
  finds the stored pin already equal to the new one and sees no move.
*/

const afterCallbacks = [];
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal()),
  after: vi.fn((cb) => afterCallbacks.push(cb)),
}));

const STORED = { lat: '40.629410547318486', lng: '22.966596' };
const facultyDistanceDeletes = [];

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: () => 'jwt',
  getUserFromToken: vi.fn(async () => ({ id: 'auth-1' })),
  getSupabaseWithToken: () => ({
    from: (table) => {
      if (table === 'listings') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: { listing_id: '0106003', rent_id: 1, location_id: 7, flags: {}, location: STORED },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'location') {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      throw new Error(`unexpected authed table ${table}`);
    },
  }),
  getSupabaseAsService: () => ({
    from: (table) => {
      if (table !== 'faculty_distances') throw new Error(`unexpected service table ${table}`);
      return {
        delete: () => ({
          eq: async (_col, id) => {
            facultyDistanceDeletes.push(id);
            return { error: null };
          },
        }),
      };
    },
  }),
}));
// The property-type lookup finds nothing, so a body with a property_type
// takes the 400 early return.
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
  }),
}));
vi.mock('@/lib/landlordAuth', () => ({ landlordIdForUser: vi.fn(async () => '0106') }));
vi.mock('@/lib/recomputeDistances', () => ({ recomputeMissingDistances: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/universityDistances', () => ({ writeUniversityDistances: vi.fn(async () => ({ error: null })) }));
vi.mock('@/lib/landlordListingBody', () => ({
  parseListingWriteBody: vi.fn(async (body) => ({ ok: true, data: { ...body } })),
}));
vi.mock('@/lib/listingGoLive', () => ({
  flagsForSubmit: vi.fn(),
  flagsForDisableToggle: vi.fn(),
  FLAGS_LIVE: {},
  deriveListingLadder: vi.fn(),
  canAdminGoLive: vi.fn(),
}));
vi.mock('@/lib/listingPinMove', async (importOriginal) => ({
  ...(await importOriginal()),
  remeasureUniversityDistances: vi.fn(async () => ({ ok: true, written: 3 })),
}));

const { PATCH } = await import('@/app/api/landlord/listings/[id]/route');
const { remeasureUniversityDistances } = await import('@/lib/listingPinMove');
const { recomputeMissingDistances } = await import('@/lib/recomputeDistances');

function patch(body) {
  return PATCH(
    new Request('https://studentx.uk/api/landlord/listings/0106003', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: '0106003' }) },
  );
}

async function runAfterCallbacks() {
  for (const cb of afterCallbacks) await cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  facultyDistanceDeletes.length = 0;
});

describe('PATCH pin move', () => {
  it('still re-measures when the handler returns early after committing the pin', async () => {
    const res = await patch({ lat: 40.64, lng: 22.94, property_type: 'no-such-type' });

    expect(res.status).toBe(400);
    expect(facultyDistanceDeletes).toEqual(['0106003']);
    expect(afterCallbacks).toHaveLength(1);

    await runAfterCallbacks();
    expect(remeasureUniversityDistances).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: '0106003', lat: 40.64, lng: 22.94 }),
    );
    expect(recomputeMissingDistances).toHaveBeenCalledTimes(1);
  });

  it('re-measures once on a successful move, without a second recompute', async () => {
    const res = await patch({ lat: 40.64, lng: 22.94 });

    expect(res.status).toBe(200);
    expect(afterCallbacks).toHaveLength(1);
    await runAfterCallbacks();
    expect(remeasureUniversityDistances).toHaveBeenCalledTimes(1);
    expect(recomputeMissingDistances).toHaveBeenCalledTimes(1);
  });

  it('leaves distances alone when the pin did not move', async () => {
    const res = await patch({ lat: 40.629410547318486, lng: 22.966596 });

    expect(res.status).toBe(200);
    expect(facultyDistanceDeletes).toEqual([]);
    await runAfterCallbacks();
    expect(remeasureUniversityDistances).not.toHaveBeenCalled();
    // The gap-filling recompute still runs, as before.
    expect(recomputeMissingDistances).toHaveBeenCalledTimes(1);
  });
});
