import { describe, it, expect } from 'vitest';
import {
  parseListingFilters,
  applyListingFilters,
  hasGroundFloorTag,
  hasAllRequiredAmenities,
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
    expect(b._calls).toContainEqual(['neq', 'landlords.verified_tier', 'none']);
    expect(b._calls).toContainEqual(['eq', 'landlords.is_verified', true]);
    // SuperLandlord = verified half (above) + paying half (is_featured).
    expect(b._calls).toContainEqual(['eq', 'is_featured', true]);
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
    expect(b._calls.some(([name, col]) => name === 'neq' && col === 'landlords.verified_tier')).toBe(false);
    expect(b._calls.some(([name, col]) => name === 'eq' && col === 'is_featured')).toBe(false);
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
});
