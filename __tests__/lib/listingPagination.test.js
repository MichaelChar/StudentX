import { describe, it, expect } from 'vitest';
import {
  PER_PAGE,
  parsePageParam,
  totalPages,
  paginate,
  paginationItems,
} from '@/lib/listingPagination';

const listing = (id) => ({ listing_id: id });
const listings = (n) => Array.from({ length: n }, (_, i) => listing(`L${i + 1}`));

describe('PER_PAGE', () => {
  // Verified on Airbnb's live desktop results page, 2026-08-07 (spec Feature 15).
  it('is 18, matching the reference', () => {
    expect(PER_PAGE).toBe(18);
  });
});

describe('parsePageParam', () => {
  it('defaults to 1 when absent', () => {
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam('')).toBe(1);
  });

  it('parses a valid page', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam('12')).toBe(12);
  });

  /*
    Junk degrades to page 1 rather than erroring. This is a browsing surface
    reached from shared links and crawler guesses; a 400 turns a junk URL into
    a dead end instead of a first page.
  */
  it('degrades junk to page 1 instead of throwing', () => {
    for (const bad of ['abc', '0', '-4', '1.5', 'NaN', 'Infinity', '1e3x', ' ']) {
      expect(parsePageParam(bad)).toBe(1);
    }
  });
});

describe('totalPages', () => {
  it('rounds up', () => {
    expect(totalPages(18)).toBe(1);
    expect(totalPages(19)).toBe(2);
    expect(totalPages(36)).toBe(2);
    expect(totalPages(37)).toBe(3);
  });

  // "Page 1 of 0" is nonsense on an empty grid.
  it('is at least 1 for an empty result set', () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(-5)).toBe(1);
    expect(totalPages(NaN)).toBe(1);
  });
});

describe('paginate', () => {
  it('returns the first page', () => {
    const r = paginate(listings(40), 1);
    expect(r.items).toHaveLength(18);
    expect(r.items[0].listing_id).toBe('L1');
    expect(r.page).toBe(1);
    expect(r.total).toBe(40);
    expect(r.totalPages).toBe(3);
  });

  it('returns a middle page', () => {
    const r = paginate(listings(40), 2);
    expect(r.items[0].listing_id).toBe('L19');
    expect(r.items).toHaveLength(18);
  });

  it('returns a short final page', () => {
    const r = paginate(listings(40), 3);
    expect(r.items).toHaveLength(4);
    expect(r.items[0].listing_id).toBe('L37');
  });

  /*
    A past-the-end page is a stale link or a crawler guess. The useful answer
    is the last real page, not an empty grid the student cannot explain.
  */
  it('clamps a past-the-end page to the last real page', () => {
    const r = paginate(listings(40), 99);
    expect(r.page).toBe(3);
    expect(r.items).toHaveLength(4);
  });

  it('clamps a below-range page to 1', () => {
    expect(paginate(listings(40), 0).page).toBe(1);
    expect(paginate(listings(40), -3).page).toBe(1);
  });

  it('handles an empty list without dividing by zero', () => {
    const r = paginate([], 1);
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(1);
    expect(r.page).toBe(1);
  });

  it('tolerates a non-array', () => {
    expect(paginate(null, 1).items).toEqual([]);
    expect(paginate(undefined, 1).total).toBe(0);
  });

  /*
    The load-bearing property: paginate must NOT reorder. Ranking happens
    before this (compareListingsByRank), and a slice that re-sorted would
    silently undo verified-first / completeness ordering.
  */
  it('preserves the order it was given', () => {
    const ranked = [listing('z'), listing('a'), listing('m')];
    expect(paginate(ranked, 1, 3).items.map((l) => l.listing_id)).toEqual([
      'z',
      'a',
      'm',
    ]);
  });

  it('covers every item exactly once across all pages', () => {
    const all = listings(40);
    const seen = [];
    for (let p = 1; p <= totalPages(40); p += 1) {
      seen.push(...paginate(all, p).items.map((l) => l.listing_id));
    }
    expect(seen).toEqual(all.map((l) => l.listing_id));
    expect(new Set(seen).size).toBe(40);
  });
});

describe('paginationItems', () => {
  it('returns a single page when there is only one', () => {
    expect(paginationItems(1, 1)).toEqual([1]);
    expect(paginationItems(1, 0)).toEqual([1]);
  });

  // The reference shape from the spec: `1 2 3 4 … 15`.
  it('renders the Airbnb first-run shape', () => {
    expect(paginationItems(1, 15)).toEqual([1, 2, 3, 4, null, 15]);
  });

  it('keeps the run dense while the student is near the start', () => {
    expect(paginationItems(2, 15)).toEqual([1, 2, 3, 4, null, 15]);
    expect(paginationItems(3, 15)).toEqual([1, 2, 3, 4, null, 15]);
  });

  it('shows neighbours around a middle page', () => {
    expect(paginationItems(8, 15)).toEqual([1, null, 7, 8, 9, null, 15]);
  });

  it('densifies again at the end', () => {
    expect(paginationItems(15, 15)).toEqual([1, null, 12, 13, 14, 15]);
  });

  it('never emits a gap that hides exactly one page', () => {
    // 1 … 3 would hide only page 2; render the number instead.
    expect(paginationItems(4, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const pages of [5, 6, 7, 8, 9, 10, 20]) {
      for (let p = 1; p <= pages; p += 1) {
        const items = paginationItems(p, pages);
        const nums = items.filter((x) => x !== null);
        for (let i = 1; i < nums.length; i += 1) {
          // A gap is only legitimate where the numbers skip more than one.
          const idx = items.indexOf(nums[i]);
          if (items[idx - 1] === null) {
            expect(nums[i] - nums[i - 1]).toBeGreaterThan(2);
          }
        }
      }
    }
  });

  it('always includes the first and last page', () => {
    for (const pages of [2, 5, 15, 40]) {
      for (let p = 1; p <= pages; p += 1) {
        const nums = paginationItems(p, pages).filter((x) => x !== null);
        expect(nums).toContain(1);
        expect(nums).toContain(pages);
      }
    }
  });

  it('always includes the current page', () => {
    for (const pages of [2, 5, 15, 40]) {
      for (let p = 1; p <= pages; p += 1) {
        expect(paginationItems(p, pages)).toContain(p);
      }
    }
  });

  it('emits strictly ascending, duplicate-free numbers', () => {
    for (const pages of [2, 5, 15, 40]) {
      for (let p = 1; p <= pages; p += 1) {
        const nums = paginationItems(p, pages).filter((x) => x !== null);
        expect(nums).toEqual([...new Set(nums)]);
        expect(nums).toEqual([...nums].sort((a, b) => a - b));
      }
    }
  });

  it('clamps an out-of-range current page', () => {
    expect(paginationItems(99, 5).filter((x) => x !== null)).toContain(5);
    expect(paginationItems(0, 5).filter((x) => x !== null)).toContain(1);
  });
});
