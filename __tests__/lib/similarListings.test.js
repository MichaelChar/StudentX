import { describe, it, expect } from 'vitest';
import { rankSimilarListings } from '@/lib/similarListings';

const current = {
  listing_id: '0100001',
  neighborhood: 'Center',
  monthly_price: 400,
};

function row(overrides) {
  return {
    listing_id: '0100099',
    neighborhood: 'Center',
    monthly_price: 400,
    listing_status: 'active',
    ...overrides,
  };
}

describe('rankSimilarListings', () => {
  it('excludes the current listing', () => {
    const out = rankSimilarListings(
      [
        row({ listing_id: '0100001', monthly_price: 400 }),
        row({ listing_id: '0100002', monthly_price: 410 }),
      ],
      current,
      4,
    );
    expect(out.map((l) => l.listing_id)).toEqual(['0100002']);
  });

  it('excludes non-active listings even if present in the candidate set', () => {
    const out = rankSimilarListings(
      [
        row({ listing_id: '0100002', listing_status: 'disabled', monthly_price: 400 }),
        row({ listing_id: '0100003', listing_status: 'draft', monthly_price: 400 }),
        row({ listing_id: '0100004', listing_status: 'active', monthly_price: 405 }),
      ],
      current,
      4,
    );
    expect(out.map((l) => l.listing_id)).toEqual(['0100004']);
  });

  it('ranks same neighbourhood ahead of others regardless of price gap', () => {
    const out = rankSimilarListings(
      [
        row({
          listing_id: '0100002',
          neighborhood: 'Toumba',
          monthly_price: 401, // closer price, wrong neighbourhood
        }),
        row({
          listing_id: '0100003',
          neighborhood: 'Center',
          monthly_price: 550, // farther price, same neighbourhood
        }),
      ],
      current,
      4,
    );
    expect(out.map((l) => l.listing_id)).toEqual(['0100003', '0100002']);
  });

  it('within a neighbourhood, ranks closest monthly_price first', () => {
    const out = rankSimilarListings(
      [
        row({ listing_id: '0100002', monthly_price: 500 }),
        row({ listing_id: '0100003', monthly_price: 410 }),
        row({ listing_id: '0100004', monthly_price: 450 }),
      ],
      current,
      4,
    );
    expect(out.map((l) => l.listing_id)).toEqual([
      '0100003',
      '0100004',
      '0100002',
    ]);
  });

  it('caps results at the requested limit (default 4)', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      row({ listing_id: `010000${i + 2}`, monthly_price: 400 + i }),
    );
    expect(rankSimilarListings(many, current).length).toBe(4);
    expect(rankSimilarListings(many, current, 3).length).toBe(3);
  });

  it('returns empty for missing current or empty candidates', () => {
    expect(rankSimilarListings([], current)).toEqual([]);
    expect(rankSimilarListings([row({})], null)).toEqual([]);
    expect(rankSimilarListings([row({})], {})).toEqual([]);
  });

  it('sorts null-priced candidates last within a tier', () => {
    const out = rankSimilarListings(
      [
        row({ listing_id: '0100002', monthly_price: null }),
        row({ listing_id: '0100003', monthly_price: 420 }),
      ],
      current,
      4,
    );
    expect(out.map((l) => l.listing_id)).toEqual(['0100003', '0100002']);
  });
});
