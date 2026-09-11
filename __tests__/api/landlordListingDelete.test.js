import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Issue #519 — deleting a listing that has bookings.

  Every FK referencing `listings` is ON DELETE CASCADE except `bookings`,
  which is RESTRICT: cascading through it would destroy financial and dispute
  history. The constraint is right. What was wrong was the handling — Postgres
  raised 23503 and this route mapped EVERY error to a bare 500 "Failed to
  delete listing", which is both the wrong status (the request was understood
  and refused, not broken) and useless to the landlord.

  The narrowness is the point: only 23503 becomes a 409. Collapsing every
  failure into one code is what hid this in the first place, and a test that
  only checked the happy path plus "some error" would let it happen again.
*/

let deleteError = null;
const eqSecond = vi.fn(async () => ({ error: deleteError }));

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: () => 'jwt',
  getUserFromToken: vi.fn(async () => ({ id: 'auth-1' })),
  getSupabaseWithToken: () => ({
    from: () => ({
      delete: () => ({ eq: () => ({ eq: eqSecond }) }),
    }),
  }),
  getSupabaseAsService: () => ({}),
}));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/landlordAuth', () => ({ landlordIdForUser: vi.fn(async () => '0106') }));
vi.mock('@/lib/recomputeDistances', () => ({ recomputeMissingDistances: vi.fn() }));
vi.mock('@/lib/universityDistances', () => ({ writeUniversityDistances: vi.fn() }));
vi.mock('@/lib/landlordListingBody', () => ({ parseListingWriteBody: vi.fn() }));
vi.mock('@/lib/listingGoLive', () => ({
  flagsForDisableToggle: vi.fn(),
  deriveListingLadder: vi.fn(),
  canAdminGoLive: vi.fn(),
}));

const { DELETE } = await import('@/app/api/landlord/listings/[id]/route');

function req() {
  return new Request('https://studentx.uk/api/landlord/listings/0106004', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer jwt' },
  });
}
const params = Promise.resolve({ id: '0106004' });

beforeEach(() => {
  vi.clearAllMocks();
  deleteError = null;
});

describe('DELETE /api/landlord/listings/[id] (#519)', () => {
  it('deletes a listing with no bookings', async () => {
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: '0106004' });
  });

  it('409s with LISTING_HAS_BOOKINGS on the FK violation', async () => {
    // 23503 = foreign_key_violation. The real message from prod:
    // 'Key is still referenced from table "bookings".'
    deleteError = { code: '23503', message: 'violates foreign key constraint' };

    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error_code).toBe('LISTING_HAS_BOOKINGS');
    // The message must name the alternative, not just refuse.
    expect(body.error).toMatch(/pause/i);
  });

  it('still 500s on any OTHER database error', async () => {
    // The regression guard. Mapping everything to 409 would be as wrong as
    // the original mapping everything to 500 — a real fault would then be
    // reported to the landlord as "you have bookings".
    deleteError = { code: '42501', message: 'permission denied' };

    const res = await DELETE(req(), { params });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error_code).toBeUndefined();
  });

  it('500s on an error with no code at all', async () => {
    deleteError = { message: 'connection reset' };
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(500);
  });
});
