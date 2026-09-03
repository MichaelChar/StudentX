import { describe, it, expect } from 'vitest';
import { landlordProfileStats } from '@/lib/landlordProfileStats';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-03T12:00:00Z').getTime();
const FRESH = new Date(NOW - 24 * HOUR).toISOString();

const keys = (rows) => rows.map((r) => r.key);

describe('landlordProfileStats', () => {
  it('always reports the active-listing count', () => {
    const rows = landlordProfileStats({ landlord: {}, activeListingCount: 3, now: NOW });
    expect(rows[0]).toEqual({ key: 'activeListings', count: 3, labelKey: 'statActiveListings' });
  });

  it('reports zero listings as zero rather than dropping the stat', () => {
    const [row] = landlordProfileStats({ landlord: {}, activeListingCount: 0, now: NOW });
    expect(row.count).toBe(0);
  });

  it('adds the reply stat for each bucket responseTimeBucket returns', () => {
    const cases = [
      [HOUR / 2, 'replyWithinHour'],
      [5 * HOUR, 'replyWithinDay'],
      [33 * HOUR, 'replyWithin2Days'],
    ];
    for (const [ms, valueKey] of cases) {
      const rows = landlordProfileStats({
        landlord: { avg_response_ms: ms, response_stats_at: FRESH },
        activeListingCount: 1,
        now: NOW,
      });
      expect(keys(rows)).toEqual(['activeListings', 'replies']);
      expect(rows[1].valueKey).toBe(valueKey);
    }
  });

  /*
    The stat is evidence a student weighs. Omitting it is honest; rendering a
    dash in an evidence column reads as a fault rather than as an absence, and
    "we usually reply eventually" is not evidence at all. responseTimeBucket
    already encodes all three reasons to stay silent.
  */
  it('omits the reply stat when there is no figure', () => {
    const rows = landlordProfileStats({
      landlord: { avg_response_ms: null },
      activeListingCount: 2,
      now: NOW,
    });
    expect(keys(rows)).toEqual(['activeListings']);
  });

  it('omits the reply stat when the figure is stale', () => {
    const rows = landlordProfileStats({
      landlord: {
        avg_response_ms: HOUR / 2,
        response_stats_at: new Date(NOW - 30 * 24 * HOUR).toISOString(),
      },
      activeListingCount: 2,
      now: NOW,
    });
    expect(keys(rows)).toEqual(['activeListings']);
  });

  it('omits the reply stat when the landlord is slower than two days', () => {
    const rows = landlordProfileStats({
      landlord: { avg_response_ms: 5 * 24 * HOUR, response_stats_at: FRESH },
      activeListingCount: 2,
      now: NOW,
    });
    expect(keys(rows)).toEqual(['activeListings']);
  });

  /*
    Feature 34 (reviews) is skipped, so there is deliberately no third stat.
    A test rather than a comment, because "add a review count" is the obvious
    next thing someone reaches for on a profile page.
  */
  it('never returns more than the two decided stats', () => {
    const rows = landlordProfileStats({
      landlord: { avg_response_ms: HOUR / 2, response_stats_at: FRESH },
      activeListingCount: 9,
      now: NOW,
    });
    expect(rows).toHaveLength(2);
  });

  it('returns keys, never rendered copy', () => {
    const rows = landlordProfileStats({
      landlord: { avg_response_ms: HOUR / 2, response_stats_at: FRESH },
      activeListingCount: 1,
      now: NOW,
    });
    for (const row of rows) {
      expect(row.labelKey).toMatch(/^stat/);
      if (row.valueKey) expect(row.valueKey).toMatch(/^reply/);
      expect(row).not.toHaveProperty('label');
    }
  });

  it('survives being handed nothing', () => {
    expect(landlordProfileStats()).toEqual([
      { key: 'activeListings', count: 0, labelKey: 'statActiveListings' },
    ]);
  });
});
