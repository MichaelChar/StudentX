import { describe, it, expect } from 'vitest';
import { listingHasBookings } from '@/lib/landlordListingSelect';

/*
  Issue #519. `bookings` is the one FK referencing `listings` that RESTRICTs
  rather than cascades — that history has to survive — so the API refuses to
  delete such a listing with a 409. This flag greys the Delete button out so
  the landlord never reaches a refusal they cannot act on.

  The DEFAULT matters more than the happy path. It must be FALSE whenever the
  embed is absent or unrecognisable: the pre-migration fallback select omits
  `bookings ( count )` entirely, and PostgREST would drop it on a relationship
  change. False keeps the button enabled and the landlord gets the 409 with
  its explanation — the behaviour before this change, which is a safe floor.
  Defaulting to true would hide Delete from listings that CAN be deleted, and
  nothing would ever tell the landlord why.
*/
describe('listingHasBookings (#519)', () => {
  it('true when the embed reports a positive count', () => {
    expect(listingHasBookings({ bookings: [{ count: 1 }] })).toBe(true);
    expect(listingHasBookings({ bookings: [{ count: 7 }] })).toBe(true);
  });

  it('false when the count is zero', () => {
    expect(listingHasBookings({ bookings: [{ count: 0 }] })).toBe(false);
  });

  it('false when the embed is missing — the fallback select omits it', () => {
    expect(listingHasBookings({ listing_id: '0106001' })).toBe(false);
  });

  it('false for an empty embed array', () => {
    expect(listingHasBookings({ bookings: [] })).toBe(false);
  });

  it('false when the shape drifts', () => {
    // PostgREST could return the count differently on a relationship change.
    expect(listingHasBookings({ bookings: [{ total: 3 }] })).toBe(false);
    expect(listingHasBookings({ bookings: {} })).toBe(false);
    expect(listingHasBookings({ bookings: 3 })).toBe(false);
  });

  it('false for null/undefined rows rather than throwing', () => {
    expect(listingHasBookings(null)).toBe(false);
    expect(listingHasBookings(undefined)).toBe(false);
  });

  it('handles a stringified count', () => {
    // Postgres bigint can arrive as a string through some clients.
    expect(listingHasBookings({ bookings: [{ count: '2' }] })).toBe(true);
    expect(listingHasBookings({ bookings: [{ count: '0' }] })).toBe(false);
  });
});
