import { describe, it, expect } from 'vitest';
import {
  buildPriceHistogram,
  maxBucketCount,
  isBucketInBudget,
} from '@/lib/priceHistogram';

describe('buildPriceHistogram', () => {
  it('returns the requested number of evenly-spaced buckets', () => {
    const h = buildPriceHistogram([], { min: 0, max: 100, buckets: 4 });
    expect(h).toHaveLength(4);
    expect(h.map((b) => [b.from, b.to])).toEqual([
      [0, 25],
      [25, 50],
      [50, 75],
      [75, 100],
    ]);
    expect(h.every((b) => b.count === 0)).toBe(true);
  });

  it('tallies prices into the correct buckets', () => {
    const listings = [
      { monthly_price: 10 }, // bucket 0
      { monthly_price: 24 }, // bucket 0
      { monthly_price: 25 }, // bucket 1 (edge -> next)
      { monthly_price: 60 }, // bucket 2
    ];
    const h = buildPriceHistogram(listings, { min: 0, max: 100, buckets: 4 });
    expect(h.map((b) => b.count)).toEqual([2, 1, 1, 0]);
  });

  it('clamps out-of-range prices into the first/last bucket', () => {
    const listings = [
      { monthly_price: -50 }, // below min -> bucket 0
      { monthly_price: 5000 }, // above max -> last bucket
      { monthly_price: 100 }, // exactly max -> last bucket
    ];
    const h = buildPriceHistogram(listings, { min: 0, max: 100, buckets: 4 });
    expect(h[0].count).toBe(1);
    expect(h[3].count).toBe(2);
  });

  it('ignores listings without a usable numeric price', () => {
    const listings = [
      { monthly_price: null },
      { monthly_price: undefined },
      {},
      { monthly_price: NaN },
      { monthly_price: 'oops' },
      { monthly_price: 50 },
    ];
    const h = buildPriceHistogram(listings, { min: 0, max: 100, buckets: 4 });
    expect(h.reduce((sum, b) => sum + b.count, 0)).toBe(1);
  });

  it('handles null/empty input and degenerate ranges', () => {
    expect(buildPriceHistogram(null, { min: 0, max: 100, buckets: 4 })).toHaveLength(4);
    expect(buildPriceHistogram([], { min: 100, max: 100 })).toEqual([]);
    expect(buildPriceHistogram([], { min: 200, max: 100 })).toEqual([]);
  });

  it('falls back to default bounds when opts are omitted', () => {
    const h = buildPriceHistogram([]);
    expect(h.length).toBe(12);
    expect(h[0].from).toBe(250);
    expect(h[h.length - 1].to).toBe(1200);
  });
});

describe('maxBucketCount', () => {
  it('returns the peak count', () => {
    expect(maxBucketCount([{ count: 1 }, { count: 5 }, { count: 3 }])).toBe(5);
  });
  it('returns 0 for empty or nullish input', () => {
    expect(maxBucketCount([])).toBe(0);
    expect(maxBucketCount(null)).toBe(0);
  });
});

describe('isBucketInBudget', () => {
  it('is true when the bucket lower edge is at or below the budget', () => {
    expect(isBucketInBudget({ from: 400 }, 500)).toBe(true);
    expect(isBucketInBudget({ from: 500 }, 500)).toBe(true);
  });
  it('is false when the bucket starts above the budget', () => {
    expect(isBucketInBudget({ from: 600 }, 500)).toBe(false);
  });
  it('treats a missing budget as no cut (all in budget)', () => {
    expect(isBucketInBudget({ from: 999 }, null)).toBe(true);
  });
});
