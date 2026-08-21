import { describe, it, expect } from 'vitest';
import {
  parseListingFilters,
  applyListingFilters,
  hasGroundFloorTag,
  hasAllRequiredAmenities,
  amenityNamesOf,
  listingCountNeedsRowFetch,
  applyListingFilterResiduals,
} from '@/lib/listingFilters';

// Thin URLSearchParams wrapper so tests read like query strings.
const sp = (qs) => new URLSearchParams(qs);

// A query-builder recorder: every method logs [name, ...args] and chains.
function recorder() {
  const calls = [];
  const b = {};
  const rec = (name) => (...args) => {
    calls.push([name, ...args]);
    return b;
  };
  for (const m of ['select', 'in', 'eq', 'neq', 'or', 'gte', 'lte', 'order']) {
    b[m] = rec(m);
  }
  b._calls = calls;
  return b;
}

describe('parseListingFilters', () => {
  it('parses a normal filter combo with defaults', () => {
    const f = parseListingFilters(
      sp('types=Studio&neighborhoods=Kentro&verified_only=true&min_duration=5&available_from=2026-09-01')
    );
    expect(f.error).toBeUndefined();
    expect(f).toMatchObject({
      types: 'Studio',
      neighborhoods: 'Kentro',
      verifiedOnly: true,
      minDurationN: 5,
      availableFromDate: '2026-09-01',
      sortBy: 'price',
      sortOrder: 'asc',
    });
  });

  it('does not read budget params (budget is the route-local divergence)', () => {
    const f = parseListingFilters(sp('max_budget=abc&min_budget=-5'));
    // Malformed budget never surfaces as an error here — it is simply ignored.
    expect(f.error).toBeUndefined();
    expect(f).not.toHaveProperty('maxBudget');
    expect(f).not.toHaveProperty('minBudget');
  });

  it('rejects invalid min_duration', () => {
    expect(parseListingFilters(sp('min_duration=7')).error).toMatch(/min_duration/);
  });

  it('rejects impossible available_from dates', () => {
    expect(parseListingFilters(sp('available_from=2026-02-31')).error).toMatch(/available_from/);
    expect(parseListingFilters(sp('available_from=nope')).error).toMatch(/available_from/);
  });

  it('parses move_in / move_out stay pair', () => {
    const f = parseListingFilters(sp('move_in=2026-09-01&move_out=2026-12-01'));
    expect(f.error).toBeUndefined();
    expect(f.moveInDate).toBe('2026-09-01');
    expect(f.moveOutDate).toBe('2026-12-01');
  });

  it('rejects incomplete or inverted stay ranges', () => {
    expect(parseListingFilters(sp('move_in=2026-09-01')).error).toMatch(/both/);
    expect(parseListingFilters(sp('move_in=2026-12-01&move_out=2026-09-01')).error).toMatch(
      /after/,
    );
  });

  it('rejects bad sort + the sort-needs-faculty rule + bad faculty id', () => {
    expect(parseListingFilters(sp('sort_by=banana')).error).toMatch(/sort_by/);
    expect(parseListingFilters(sp('sort_order=sideways')).error).toMatch(/sort_order/);
    expect(parseListingFilters(sp('sort_by=walk_minutes')).error).toMatch(/requires a faculty/);
    expect(parseListingFilters(sp('faculty=Not Valid')).error).toMatch(/faculty/);
  });

  it('rejects empty types / exclude_amenities', () => {
    expect(parseListingFilters(sp('types=')).error).toMatch(/types/);
    expect(parseListingFilters(sp('exclude_amenities=')).error).toMatch(/exclude_amenities/);
  });
});

describe('applyListingFilters', () => {
  it('applies every non-budget clause on the main path', () => {
    const f = parseListingFilters(
      sp('neighborhoods=Kentro,Toumba&types=Studio&faculty=auth-main&min_duration=5&verified_only=true&require_bills_included=true&exclude_ground_floor=true&available_from=2026-09-01')
    );
    const b = recorder();
    applyListingFilters(b, f, { amenityListingIds: ['a', 'b'] });

    expect(b._calls).toContainEqual(['in', 'listing_id', ['a', 'b']]);
    expect(b._calls).toContainEqual(['in', 'location.neighborhood', ['Kentro', 'Toumba']]);
    expect(b._calls).toContainEqual(['in', 'property_types.name', ['Studio']]);
    expect(b._calls).toContainEqual(['eq', 'faculty_distances.faculty_id', 'auth-main']);
    expect(b._calls).toContainEqual(['lte', 'min_duration_months', 5]);
    expect(b._calls).toContainEqual(['eq', 'landlords.is_verified', true]);
    expect(b._calls).toContainEqual(['eq', 'rent.bills_included', true]);
    expect(b._calls).toContainEqual(['or', 'floor.is.null,floor.neq.0']);
    expect(b._calls).toContainEqual(['or', 'available_from.is.null,available_from.lte.2026-09-01']);
    // never touches the budget column (min_duration's lte is on min_duration_months)
    expect(
      b._calls.some(([name, col]) => (name === 'gte' || name === 'lte') && col === 'rent.monthly_price')
    ).toBe(false);
  });

  it('skips verified_only and min_duration on the fallback path', () => {
    const f = parseListingFilters(sp('verified_only=true&min_duration=5&types=Studio'));
    const b = recorder();
    applyListingFilters(b, f, { fallback: true });

    // types still applied...
    expect(b._calls).toContainEqual(['in', 'property_types.name', ['Studio']]);
    // ...but the two fallback-incompatible clauses are skipped.
    expect(b._calls.some(([name, col]) => name === 'eq' && col === 'landlords.is_verified')).toBe(false);
    expect(b._calls.some(([name, col]) => name === 'lte' && col === 'min_duration_months')).toBe(false);
  });
});

describe('amenity residual predicates', () => {
  it('hasGroundFloorTag is case-insensitive and null-safe', () => {
    expect(hasGroundFloorTag(['WiFi', 'Ground Floor'])).toBe(true);
    expect(hasGroundFloorTag(['ground floor'])).toBe(true);
    expect(hasGroundFloorTag(['WiFi'])).toBe(false);
    expect(hasGroundFloorTag(null)).toBe(false);
  });

  it('hasAllRequiredAmenities requires every item, case-insensitive', () => {
    expect(hasAllRequiredAmenities(['Furnished', 'AC'], ['furnished', 'ac'])).toBe(true);
    expect(hasAllRequiredAmenities(['Furnished'], ['Furnished', 'AC'])).toBe(false);
    expect(hasAllRequiredAmenities(['Furnished'], [])).toBe(true);
  });

  it('amenityNamesOf handles object and array embed shapes', () => {
    expect(
      amenityNamesOf({
        listing_amenities: [
          { amenities: { name: 'WiFi' } },
          { amenities: [{ name: 'AC' }] },
          { amenities: null },
        ],
      }),
    ).toEqual(['WiFi', 'AC']);
    expect(amenityNamesOf(null)).toEqual([]);
  });
});

describe('listingCountNeedsRowFetch', () => {
  it('is false when every filter is query-side', () => {
    const f = parseListingFilters(
      sp('types=Studio&neighborhoods=Kentro&verified_only=true&min_duration=5'),
    );
    expect(listingCountNeedsRowFetch(f, false)).toBe(false);
  });

  it('is true for the three JS residuals /api/listings cannot push to SQL', () => {
    expect(listingCountNeedsRowFetch(parseListingFilters(sp('exclude_ground_floor=true')))).toBe(
      true,
    );
    expect(listingCountNeedsRowFetch(parseListingFilters(sp()), true)).toBe(true);
    expect(
      listingCountNeedsRowFetch(
        parseListingFilters(sp('move_in=2026-09-01&move_out=2026-12-01')),
      ),
    ).toBe(true);
  });
});

describe('applyListingFilterResiduals', () => {
  const wifi = { listing_amenities: [{ amenities: { name: 'WiFi' } }] };
  const ground = {
    listing_id: 'g',
    listing_amenities: [{ amenities: { name: 'Ground Floor' } }],
  };
  const furnished = {
    listing_id: 'f',
    listing_amenities: [{ amenities: { name: 'Furnished' } }],
  };

  it('drops ground-floor-tagged rows when exclude_ground_floor is on', () => {
    const f = parseListingFilters(sp('exclude_ground_floor=true'));
    const out = applyListingFilterResiduals([{ ...wifi, listing_id: 'a' }, ground], f);
    expect(out.map((r) => r.listing_id)).toEqual(['a']);
  });

  it('applies the amenity AND-filter only when the RPC failed', () => {
    const f = parseListingFilters(sp('exclude_amenities=Furnished'));
    const rows = [furnished, { listing_id: 'w', ...wifi }];
    expect(applyListingFilterResiduals(rows, f, { amenityRpcFailed: false })).toHaveLength(2);
    expect(
      applyListingFilterResiduals(rows, f, { amenityRpcFailed: true }).map((r) => r.listing_id),
    ).toEqual(['f']);
  });

  it('drops blocked calendars and listings whose min/max duration cannot fit the stay', () => {
    const f = parseListingFilters(sp('move_in=2026-09-01&move_out=2026-12-01'));
    const rows = [
      { listing_id: 'ok', min_duration_months: 1, max_duration_months: 12 },
      { listing_id: 'blocked', min_duration_months: 1, max_duration_months: 12 },
      { listing_id: 'too-long-min', min_duration_months: 9, max_duration_months: 12 },
    ];
    const out = applyListingFilterResiduals(rows, f, { blockedIds: ['blocked'] });
    expect(out.map((r) => r.listing_id)).toEqual(['ok']);
  });
});
