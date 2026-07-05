import { describe, it, expect } from 'vitest';
import { deriveFacets, filterResources, relaxFilters } from '@/lib/resources/facets';

const resources = [
  { id: '1', type: 'practice-test', semester: 'semester-2', country: 'gr' },
  { id: '2', type: 'practice-test', semester: 'semester-2', country: 'gr' },
  { id: '3', type: 'flashcard-deck', semester: 'semester-2', country: 'gr' },
];

describe('deriveFacets', () => {
  it('hides a facet with only one distinct value', () => {
    const facets = deriveFacets(resources);
    const keys = facets.map((f) => f.key);
    expect(keys).toEqual(['type']);
    expect(keys).not.toContain('semester');
    expect(keys).not.toContain('country');
  });

  it('computes correct counts for the surviving facet', () => {
    const [typeFacet] = deriveFacets(resources);
    const counts = Object.fromEntries(typeFacet.options.map((o) => [o.value, o.count]));
    expect(counts['practice-test']).toBe(2);
    expect(counts['flashcard-deck']).toBe(1);
  });

  it('surfaces a facet once it gains a second distinct value', () => {
    const varied = [...resources, { id: '4', type: 'practice-test', semester: 'semester-1', country: 'gr' }];
    const keys = deriveFacets(varied).map((f) => f.key);
    expect(keys).toContain('semester');
  });
});

describe('filterResources', () => {
  it('AND-combines multiple active facets', () => {
    const filtered = filterResources(resources, { type: 'practice-test', semester: 'semester-2' });
    expect(filtered.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('ignores falsy filter values', () => {
    expect(filterResources(resources, { type: null, semester: undefined })).toHaveLength(3);
  });

  it('returns everything when no filters are active', () => {
    expect(filterResources(resources, {})).toHaveLength(3);
  });
});

describe('relaxFilters', () => {
  it('drops the most-recently-changed facet first when the combination is empty', () => {
    const filters = { type: 'flashcard-deck', semester: 'semester-1', country: null };
    const exact = filterResources(resources, filters);
    expect(exact).toHaveLength(0);

    const relaxed = relaxFilters(resources, filters, 'semester');
    expect(relaxed.droppedKey).toBe('semester');
    expect(relaxed.results.length).toBeGreaterThan(0);
    expect(relaxed.results.every((r) => r.type === 'flashcard-deck')).toBe(true);
  });

  it('keeps relaxing until a non-empty result set is found', () => {
    const filters = { type: 'flashcard-deck', semester: 'semester-1' };
    const relaxed = relaxFilters(resources, filters, null);
    expect(relaxed.results.length).toBeGreaterThan(0);
  });

  it('never returns an empty list when resources exist', () => {
    const filters = { type: 'flashcard-deck', semester: 'semester-1', country: 'us' };
    const relaxed = relaxFilters(resources, filters, 'country');
    expect(relaxed.results.length).toBeGreaterThan(0);
  });
});
