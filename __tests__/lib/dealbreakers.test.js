import { describe, it, expect } from 'vitest';
import { applyDealbreakers } from '@/lib/dealbreakers';

// Minimal transformListing-shaped row; floor 2 / bills included / no amenities
// unless overridden.
const L = (over = {}) => ({
  listing_id: over.listing_id ?? 'x',
  floor: 'floor' in over ? over.floor : 2,
  bills_included: 'bills_included' in over ? over.bills_included : true,
  amenities: over.amenities ?? [],
});

describe('applyDealbreakers', () => {
  it('returns the input untouched when there are no dealbreakers', () => {
    const items = [L(), L({ floor: 0 })];
    expect(applyDealbreakers(items, [])).toBe(items);
    expect(applyDealbreakers(items, undefined)).toBe(items);
  });

  it('ground_floor excludes floor 0 and the "ground floor" tag, keeps null/upper floors', () => {
    const items = [
      L({ listing_id: 'ground', floor: 0 }),
      L({ listing_id: 'tagged', floor: 3, amenities: ['Ground Floor'] }),
      L({ listing_id: 'unset', floor: null }),
      L({ listing_id: 'upper', floor: 2 }),
    ];
    expect(applyDealbreakers(items, ['ground_floor']).map((l) => l.listing_id)).toEqual(['unset', 'upper']);
  });

  it('bills_not_included keeps only listings with bills included', () => {
    const items = [
      L({ listing_id: 'incl', bills_included: true }),
      L({ listing_id: 'excl', bills_included: false }),
    ];
    expect(applyDealbreakers(items, ['bills_not_included']).map((l) => l.listing_id)).toEqual(['incl']);
  });

  it('unfurnished requires the Furnished amenity (case-insensitive)', () => {
    const items = [
      L({ listing_id: 'furn', amenities: ['furnished', 'WiFi'] }),
      L({ listing_id: 'bare', amenities: ['WiFi'] }),
    ];
    expect(applyDealbreakers(items, ['unfurnished']).map((l) => l.listing_id)).toEqual(['furn']);
  });

  it('no_ac requires the AC amenity', () => {
    const items = [
      L({ listing_id: 'ac', amenities: ['AC'] }),
      L({ listing_id: 'noac', amenities: [] }),
    ];
    expect(applyDealbreakers(items, ['no_ac']).map((l) => l.listing_id)).toEqual(['ac']);
  });

  it('combines multiple dealbreakers with AND semantics', () => {
    const items = [
      L({ listing_id: 'good', floor: 2, bills_included: true, amenities: ['Furnished', 'AC'] }),
      L({ listing_id: 'noac', floor: 2, bills_included: true, amenities: ['Furnished'] }),
      L({ listing_id: 'ground', floor: 0, bills_included: true, amenities: ['Furnished', 'AC'] }),
      L({ listing_id: 'nobills', floor: 2, bills_included: false, amenities: ['Furnished', 'AC'] }),
    ];
    const kept = applyDealbreakers(
      items,
      ['ground_floor', 'bills_not_included', 'unfurnished', 'no_ac'],
    ).map((l) => l.listing_id);
    expect(kept).toEqual(['good']);
  });
});
