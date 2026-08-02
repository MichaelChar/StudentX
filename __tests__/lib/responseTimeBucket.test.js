import { describe, it, expect } from 'vitest';
import {
  responseTimeBucket,
  RESPONSE_BUCKET_WITHIN_HOUR,
  RESPONSE_BUCKET_WITHIN_DAY,
  RESPONSE_BUCKET_WITHIN_2_DAYS,
  RESPONSE_STATS_STALE_MS,
} from '@/lib/responseTimeBucket';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-08-02T12:00:00.000Z').getTime();

describe('responseTimeBucket', () => {
  it('returns null when avg_response_ms is null, undefined, NaN, or negative', () => {
    expect(responseTimeBucket(null, null, NOW)).toBeNull();
    expect(responseTimeBucket(undefined, null, NOW)).toBeNull();
    expect(responseTimeBucket(NaN, null, NOW)).toBeNull();
    expect(responseTimeBucket(-1, null, NOW)).toBeNull();
  });

  it('buckets ≤1h as within_hour', () => {
    expect(responseTimeBucket(0, null, NOW)).toBe(RESPONSE_BUCKET_WITHIN_HOUR);
    expect(responseTimeBucket(30 * 60 * 1000, null, NOW)).toBe(
      RESPONSE_BUCKET_WITHIN_HOUR,
    );
    expect(responseTimeBucket(HOUR, null, NOW)).toBe(RESPONSE_BUCKET_WITHIN_HOUR);
  });

  it('buckets ≤24h as within_day', () => {
    expect(responseTimeBucket(HOUR + 1, null, NOW)).toBe(RESPONSE_BUCKET_WITHIN_DAY);
    expect(responseTimeBucket(DAY, null, NOW)).toBe(RESPONSE_BUCKET_WITHIN_DAY);
  });

  it('buckets ≤48h as within_2_days', () => {
    expect(responseTimeBucket(DAY + 1, null, NOW)).toBe(
      RESPONSE_BUCKET_WITHIN_2_DAYS,
    );
    expect(responseTimeBucket(2 * DAY, null, NOW)).toBe(
      RESPONSE_BUCKET_WITHIN_2_DAYS,
    );
  });

  it('omits averages slower than two days', () => {
    expect(responseTimeBucket(2 * DAY + 1, null, NOW)).toBeNull();
    expect(responseTimeBucket(5 * DAY, null, NOW)).toBeNull();
  });

  it('shows when response_stats_at is missing (never stamped)', () => {
    // After migration 103 the column is selectable; when null (cron never
    // wrote a stamp) still show a bucket from avg_response_ms alone.
    expect(responseTimeBucket(HOUR, null, NOW)).toBe(RESPONSE_BUCKET_WITHIN_HOUR);
    expect(responseTimeBucket(HOUR, undefined, NOW)).toBe(
      RESPONSE_BUCKET_WITHIN_HOUR,
    );
  });

  it('shows when response_stats_at is fresh', () => {
    const fresh = new Date(NOW - DAY).toISOString();
    expect(responseTimeBucket(HOUR, fresh, NOW)).toBe(RESPONSE_BUCKET_WITHIN_HOUR);
  });

  it('omits when response_stats_at is older than ~7 days', () => {
    const stale = new Date(NOW - RESPONSE_STATS_STALE_MS - 1).toISOString();
    expect(responseTimeBucket(HOUR, stale, NOW)).toBeNull();
  });

  it('shows at exactly the 7-day boundary (not older than)', () => {
    const atBoundary = new Date(NOW - RESPONSE_STATS_STALE_MS).toISOString();
    expect(responseTimeBucket(HOUR, atBoundary, NOW)).toBe(
      RESPONSE_BUCKET_WITHIN_HOUR,
    );
  });

  it('omits when response_stats_at is unparseable', () => {
    expect(responseTimeBucket(HOUR, 'not-a-date', NOW)).toBeNull();
  });

  it('accepts a Date instance for response_stats_at and now', () => {
    const stamped = new Date(NOW - HOUR);
    expect(responseTimeBucket(HOUR, stamped, new Date(NOW))).toBe(
      RESPONSE_BUCKET_WITHIN_HOUR,
    );
  });
});
