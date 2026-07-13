import { describe, it, expect } from 'vitest';
import {
  deriveFacets,
  filterResources,
  getFacetOptions,
  relaxFilters,
  resourcesMatchingOtherFilters,
  searchResources,
} from '@/lib/resources/facets';
import { getSubjectLabel } from '@/lib/resources/taxonomy';

const resources = [
  { id: '1', type: 'practice-test', semester: 'semester-2', country: 'gr', year: 2026 },
  { id: '2', type: 'practice-test', semester: 'semester-2', country: 'gr', year: 2026 },
  { id: '3', type: 'flashcard-deck', semester: 'semester-2', country: 'gr', year: 2026 },
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
    const varied = [...resources, { id: '4', type: 'practice-test', semester: 'semester-1', country: 'gr', year: 2026 }];
    const keys = deriveFacets(varied).map((f) => f.key);
    expect(keys).toContain('semester');
  });

  it('stringifies numeric facet values (e.g. year) and labels them with the value itself', () => {
    const varied = [...resources, { id: '4', type: 'practice-test', semester: 'semester-2', country: 'gr', year: 2025 }];
    const yearFacet = deriveFacets(varied).find((f) => f.key === 'year');
    expect(yearFacet).toBeDefined();
    const options = Object.fromEntries(yearFacet.options.map((o) => [o.value, o]));
    expect(options['2026']).toMatchObject({ label: '2026', count: 3 });
    expect(options['2025']).toMatchObject({ label: '2025', count: 1 });
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

  it('filters a numeric field (year) against a URL-style string value', () => {
    const varied = [...resources, { id: '4', type: 'practice-test', semester: 'semester-2', country: 'gr', year: 2025 }];
    const filtered = filterResources(varied, { year: '2025' });
    expect(filtered.map((r) => r.id)).toEqual(['4']);
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

describe('resourcesMatchingOtherFilters + getFacetOptions (refined faceting)', () => {
  const mixed = [
    { id: 'p-s2', type: 'practice-test', semester: 'semester-2', country: 'gr', year: 2026 },
    { id: 'p-s6', type: 'practice-test', semester: 'semester-6', country: 'gr', year: 2026 },
    { id: 'f-s2', type: 'flashcard-deck', semester: 'semester-2', country: 'gr', year: 2026 },
  ];

  it('excludes the target facet when building the base list', () => {
    const baseForSemester = resourcesMatchingOtherFilters(mixed, { type: 'practice-test' }, 'semester');
    // Should include both semesters (as long as they match the other filter)
    expect(baseForSemester.map((r) => r.semester)).toContain('semester-2');
    expect(baseForSemester.map((r) => r.semester)).toContain('semester-6');
  });

  it('getFacetOptions on the base produces refined counts', () => {
    const baseForType = resourcesMatchingOtherFilters(mixed, { semester: 'semester-2' }, 'type');
    const typeOptions = getFacetOptions(baseForType, 'type');
    const counts = Object.fromEntries(typeOptions.map((o) => [o.value, o.count]));
    // Only s2 resources: 1 practice + 1 flashcard
    expect(counts['practice-test']).toBe(1);
    expect(counts['flashcard-deck']).toBe(1);
  });

  it('semester options are narrowed when another filter is active', () => {
    const baseForSemester = resourcesMatchingOtherFilters(mixed, { type: 'practice-test' }, 'semester');
    const semesterOptions = getFacetOptions(baseForSemester, 'semester');
    expect(semesterOptions).toHaveLength(2);
    const counts = Object.fromEntries(semesterOptions.map((o) => [o.value, o.count]));
    expect(counts['semester-2']).toBe(1); // only the practice-test in s2
    expect(counts['semester-6']).toBe(1);
  });

  it('deriveFacets still decides visibility from the full unfiltered set', () => {
    const keys = deriveFacets(mixed).map((f) => f.key);
    expect(keys).toContain('type');
    expect(keys).toContain('semester');
  });
});

describe('subject facet (new)', () => {
  const withSubjects = [
    { id: 'p1', type: 'practice-test', semester: 'semester-2', subject: 'anatomy-1', country: 'gr', year: 2026 },
    { id: 'p2', type: 'practice-test', semester: 'semester-2', subject: 'biochemistry', country: 'gr', year: 2026 },
    { id: 'f1', type: 'flashcard-deck', semester: 'semester-2', subject: 'general-physiology', country: 'gr', year: 2026 },
  ];

  it('includes subject in FACET_KEYS and surfaces when >=2 distinct', () => {
    const keys = deriveFacets(withSubjects).map((f) => f.key);
    expect(keys).toContain('subject');
  });

  it('getFacetOptions derives human labels for subject values', () => {
    const opts = getFacetOptions(withSubjects, 'subject');
    const labels = Object.fromEntries(opts.map((o) => [o.value, o.label]));
    expect(labels['anatomy-1']).toBe('Anatomy I');
    expect(labels['biochemistry']).toBe('Biochemistry I');
    expect(labels['general-physiology']).toBe('General Physiology');
  });
});

describe('searchResources (new)', () => {
  const data = [
    { id: 'a', title: 'Anatomy I — Mega', description: 'Bones and muscles', subject: 'anatomy-1' },
    { id: 'b', title: 'Biochem Predicted', description: 'Metabolism exam', subject: 'biochemistry' },
    { id: 'c', title: 'General Physiology Deck', description: 'High yield', subject: 'general-physiology' },
  ];

  it('case-insensitive substring over title + description + subject label', () => {
    expect(searchResources(data, 'anatomy').map((r) => r.id)).toEqual(['a']);
    expect(searchResources(data, 'BONES').map((r) => r.id)).toEqual(['a']);
    expect(searchResources(data, 'biochemistry').map((r) => r.id)).toEqual(['b']); // label match
    expect(searchResources(data, 'exam').map((r) => r.id)).toEqual(['b']);
  });

  it('empty or blank q returns everything', () => {
    expect(searchResources(data, '').length).toBe(3);
    expect(searchResources(data, '   ').length).toBe(3);
  });
});

describe('search composes with facets + relaxation with q (new)', () => {
  const data = [
    { id: 'a1', type: 'practice-test', semester: 'semester-2', subject: 'anatomy-1', country: 'gr', year: 2026 },
    { id: 'a2', type: 'practice-test', semester: 'semester-2', subject: 'anatomy-1', country: 'gr', year: 2026 },
    { id: 'b1', type: 'practice-test', semester: 'semester-2', subject: 'biochemistry', country: 'gr', year: 2026 },
  ];

  it('search + facet filter is AND', () => {
    const filtered = filterResources(data, { semester: 'semester-2' });
    const withSearch = searchResources(filtered, 'anatomy');
    expect(withSearch.map((r) => r.id)).toEqual(['a1', 'a2']);
  });

  it('facet+search zero triggers facet relaxation (q kept applied)', () => {
    // Filter to a subject + search that only that subject has, but force empty by bad combo
    const res = searchResources(filterResources(data, { semester: 'semester-2', subject: 'biochemistry' }), 'anatomy');
    expect(res.length).toBe(0);

    // Using explorer-style: relax facets then search on result
    const relaxed = relaxFilters(data, { semester: 'semester-2', subject: 'biochemistry' }, 'subject');
    const afterSearch = searchResources(relaxed.results, 'anatomy');
    // After dropping subject we still have semester-2; 'anatomy' search should match
    expect(afterSearch.length).toBeGreaterThan(0);
    expect(afterSearch.every((r) => r.subject === 'anatomy-1')).toBe(true);
  });

  it('search alone zero shows facet results (never empty)', () => {
    const facetRes = filterResources(data, {});
    const searched = searchResources(facetRes, 'no-such-term-xyz');
    expect(searched.length).toBe(0);
    // In explorer this path returns the facetRes (un-searched) + message
    expect(facetRes.length).toBe(3);
  });
});
