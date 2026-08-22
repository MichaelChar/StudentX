import { describe, it, expect } from 'vitest';
import {
  AMENITY_PREVIEW_COUNT,
  DURATION_MONTHS,
  EMPTY_VALUE,
  HISTOGRAM_BUCKETS,
  clearFilters,
  hasActiveFilters,
  isBucketInRange,
  isResultCountPending,
  normalizeOptions,
  parsePriceInput,
  resolveHistogram,
  splitAmenities,
  toggleInList,
} from '@/lib/filtersModal';

describe('constants', () => {
  it('splits amenities at the Feature 7 chip-row length', () => {
    expect(AMENITY_PREVIEW_COUNT).toBe(10);
  });

  it('keeps the API-valid duration set', () => {
    expect(DURATION_MONTHS).toEqual([1, 5, 9]);
  });
});

describe('normalizeOptions', () => {
  it('returns [] for null/empty input', () => {
    expect(normalizeOptions(null)).toEqual([]);
    expect(normalizeOptions([])).toEqual([]);
  });

  it('passes strings through as value and label', () => {
    expect(normalizeOptions(['Kentro', 'Toumba'])).toEqual([
      { value: 'Kentro', label: 'Kentro' },
      { value: 'Toumba', label: 'Toumba' },
    ]);
  });

  it('prefers label over name, and value over id/slug/name', () => {
    expect(
      normalizeOptions([
        { value: 'ac', label: 'Air conditioning', name: 'AC' },
        { id: 'wifi', name: 'Wi-Fi' },
        { slug: 'kentro' },
      ]),
    ).toEqual([
      { value: 'ac', label: 'Air conditioning' },
      { value: 'wifi', label: 'Wi-Fi' },
      { value: 'kentro', label: 'kentro' },
    ]);
  });

  it('drops nullish and empty entries', () => {
    expect(normalizeOptions([null, '', { label: 'x' }, 'ok'])).toEqual([
      { value: 'ok', label: 'ok' },
    ]);
  });
});

describe('toggleInList', () => {
  it('adds a missing value and removes a present one', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('treats a non-array as empty', () => {
    expect(toggleInList(null, 'a')).toEqual(['a']);
  });
});

describe('parsePriceInput', () => {
  it('clears on empty', () => {
    expect(parsePriceInput('')).toEqual({ value: null });
    expect(parsePriceInput(null)).toEqual({ value: null });
  });

  it('accepts finite non-negative numbers', () => {
    expect(parsePriceInput('450')).toEqual({ value: 450 });
    expect(parsePriceInput(0)).toEqual({ value: 0 });
  });

  it('rejects negatives and garbage rather than wiping', () => {
    expect(parsePriceInput('-1')).toEqual({ invalid: true });
    expect(parsePriceInput('nope')).toEqual({ invalid: true });
  });
});

describe('hasActiveFilters / clearFilters', () => {
  it('is false for the empty shape and true for any set field', () => {
    expect(hasActiveFilters(EMPTY_VALUE)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_VALUE, minPrice: 0 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_VALUE, minDuration: 5 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_VALUE, selectedTypes: ['Studio'] })).toBe(
      true,
    );
  });

  it('clears the five modal fields and keeps extra parent keys', () => {
    const next = clearFilters({
      minPrice: 300,
      maxPrice: 900,
      selectedTypes: ['Studio'],
      minDuration: 9,
      selectedAmenities: ['Wi-Fi'],
      selectedNeighborhoods: ['Kentro'],
      moveIn: '2026-09-01',
    });
    expect(next).toEqual({
      ...EMPTY_VALUE,
      moveIn: '2026-09-01',
    });
  });
});

describe('splitAmenities', () => {
  it('puts the first 10 in preview and the rest behind', () => {
    const list = Array.from({ length: 19 }, (_, i) => i);
    const { preview, rest } = splitAmenities(list);
    expect(preview).toHaveLength(10);
    expect(rest).toHaveLength(9);
    expect(preview[0]).toBe(0);
    expect(rest[0]).toBe(10);
  });

  it('has no rest when the list is short', () => {
    expect(splitAmenities(['a', 'b']).rest).toEqual([]);
  });
});

describe('isResultCountPending', () => {
  it('treats null/undefined as pending and 0 as a real count', () => {
    expect(isResultCountPending(null)).toBe(true);
    expect(isResultCountPending(undefined)).toBe(true);
    expect(isResultCountPending(0)).toBe(false);
    expect(isResultCountPending(3)).toBe(false);
  });
});

describe('isBucketInRange', () => {
  const bucket = { from: 250, to: 329, count: 2 };

  it('is true when either bound is missing', () => {
    expect(isBucketInRange(bucket, null, null)).toBe(true);
    expect(isBucketInRange(bucket, 100, null)).toBe(true);
    expect(isBucketInRange(bucket, null, 400)).toBe(true);
  });

  it('drops buckets wholly below min or wholly above max', () => {
    expect(isBucketInRange(bucket, 330, null)).toBe(false);
    expect(isBucketInRange(bucket, null, 249)).toBe(false);
  });

  it('keeps a bucket that contains the bound', () => {
    expect(isBucketInRange(bucket, 300, 300)).toBe(true);
  });
});

describe('resolveHistogram', () => {
  it('is pending when the prop is absent', () => {
    expect(resolveHistogram(null)).toEqual({ status: 'pending', buckets: [] });
    expect(resolveHistogram(undefined).status).toBe('pending');
  });

  it('is empty for [] and all-zero buckets', () => {
    expect(resolveHistogram([])).toEqual({ status: 'empty', buckets: [] });
    expect(
      resolveHistogram([
        { from: 0, to: 100, count: 0 },
        { from: 100, to: 200, count: 0 },
      ]).status,
    ).toBe('empty');
  });

  it('passes pre-bucketed objects through', () => {
    const buckets = [
      { from: 0, to: 100, count: 1 },
      { from: 100, to: 200, count: 3 },
    ];
    expect(resolveHistogram(buckets)).toEqual({ status: 'ready', buckets });
  });

  it('buckets a raw prices array onto the results-page axis', () => {
    const result = resolveHistogram([300, 400, 400, 2000]);
    expect(result.status).toBe('ready');
    expect(result.buckets).toHaveLength(HISTOGRAM_BUCKETS);
    expect(result.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(4);
  });
});
