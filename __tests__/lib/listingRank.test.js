import { describe, it, expect } from 'vitest';
import { compareListingsByRank } from '@/lib/listingRank';

/** Minimal listing shape for rank tests. */
function listing(overrides = {}) {
  return {
    listing_id: '0100001',
    is_verified: false,
    avg_response_ms: null,
    monthly_price: 400,
    photos: ['a.jpg'],
    description: 'x',
    amenities: ['wifi'],
    sqm: 30,
    floor: 1,
    faculty_distances: [],
    ...overrides,
  };
}

describe('compareListingsByRank', () => {
  it('sorts verified listings before unverified', () => {
    const a = listing({ listing_id: '0100001', is_verified: false });
    const b = listing({ listing_id: '0100002', is_verified: true });
    expect(compareListingsByRank(a, b)).toBeGreaterThan(0);
    expect(compareListingsByRank(b, a)).toBeLessThan(0);
  });

  it('sorts faster avg_response_ms before slower when other keys tie', () => {
    const fast = listing({ listing_id: '0100001', avg_response_ms: 60_000 });
    const slow = listing({ listing_id: '0100002', avg_response_ms: 3_600_000 });
    const ordered = [slow, fast].sort(compareListingsByRank);
    expect(ordered.map((l) => l.listing_id)).toEqual(['0100001', '0100002']);
  });

  it('sorts NULL avg_response_ms last (behind any known response time)', () => {
    const known = listing({ listing_id: '0100001', avg_response_ms: 5_000_000 });
    const unknown = listing({ listing_id: '0100002', avg_response_ms: null });
    const alsoUnknown = listing({ listing_id: '0100003', avg_response_ms: null });

    expect(compareListingsByRank(known, unknown)).toBeLessThan(0);
    expect(compareListingsByRank(unknown, known)).toBeGreaterThan(0);

    // Both null → fall through to listing_id tiebreaker (newer id first).
    const ordered = [unknown, known, alsoUnknown].sort(compareListingsByRank);
    expect(ordered.map((l) => l.listing_id)).toEqual([
      '0100001', // known response time first
      '0100003', // nulls last; higher listing_id first among them
      '0100002',
    ]);
  });

  it('applies student metric after response time', () => {
    const cheap = listing({
      listing_id: '0100001',
      avg_response_ms: 1000,
      monthly_price: 300,
    });
    const pricey = listing({
      listing_id: '0100002',
      avg_response_ms: 1000,
      monthly_price: 600,
    });
    const ordered = [pricey, cheap].sort((a, b) =>
      compareListingsByRank(a, b, { sortBy: 'price', sortOrder: 'asc' }),
    );
    expect(ordered.map((l) => l.listing_id)).toEqual(['0100001', '0100002']);
  });
});
