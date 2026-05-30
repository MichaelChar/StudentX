import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  computeFirstResponseStats,
} from '@/lib/landlordResponseTime';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatDuration', () => {
  it('returns null for nullish / invalid / negative input', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
  });

  it('renders sub-minute as <1m', () => {
    expect(formatDuration(0)).toBe('<1m');
    expect(formatDuration(30 * 1000)).toBe('<1m');
  });

  it('renders minutes under an hour', () => {
    expect(formatDuration(12 * MIN)).toBe('12m');
    expect(formatDuration(59 * MIN)).toBe('59m');
  });

  it('renders hours, with minutes when present', () => {
    expect(formatDuration(4 * HOUR)).toBe('4h');
    expect(formatDuration(4 * HOUR + 30 * MIN)).toBe('4h 30m');
  });

  it('rolls a 60-minute rounding edge up to the next hour', () => {
    // 4h 59m30s rounds the minutes to 60 → should read 5h, not "4h 60m".
    expect(formatDuration(4 * HOUR + 59.6 * MIN)).toBe('5h');
  });

  it('renders days, with hours when present', () => {
    expect(formatDuration(DAY)).toBe('1d');
    expect(formatDuration(DAY + 3 * HOUR)).toBe('1d 3h');
    expect(formatDuration(2 * DAY)).toBe('2d');
  });
});

describe('computeFirstResponseStats', () => {
  const base = '2026-01-01T00:00:00.000Z';
  const at = (ms) => new Date(new Date(base).getTime() + ms).toISOString();

  it('returns empty stats when there are no replies', () => {
    const inquiries = [{ inquiry_id: 'a', created_at: base }];
    expect(computeFirstResponseStats(inquiries, [])).toEqual({
      avgMs: null,
      count: 0,
      formatted: null,
    });
  });

  it('uses the EARLIEST landlord message per inquiry regardless of order', () => {
    const inquiries = [{ inquiry_id: 'a', created_at: base }];
    const messages = [
      { inquiry_id: 'a', created_at: at(5 * HOUR) }, // later reply first
      { inquiry_id: 'a', created_at: at(2 * HOUR) }, // earliest = 2h
    ];
    const out = computeFirstResponseStats(inquiries, messages);
    expect(out.count).toBe(1);
    expect(out.avgMs).toBe(2 * HOUR);
    expect(out.formatted).toBe('2h');
  });

  it('excludes inquiries with no landlord reply (not counted as zero)', () => {
    const inquiries = [
      { inquiry_id: 'a', created_at: base }, // replied at 2h
      { inquiry_id: 'b', created_at: base }, // never replied
    ];
    const messages = [{ inquiry_id: 'a', created_at: at(2 * HOUR) }];
    const out = computeFirstResponseStats(inquiries, messages);
    // Only inquiry 'a' contributes; average is 2h, not 1h.
    expect(out.count).toBe(1);
    expect(out.avgMs).toBe(2 * HOUR);
  });

  it('averages across multiple replied inquiries', () => {
    const inquiries = [
      { inquiry_id: 'a', created_at: base },
      { inquiry_id: 'b', created_at: base },
    ];
    const messages = [
      { inquiry_id: 'a', created_at: at(2 * HOUR) },
      { inquiry_id: 'b', created_at: at(4 * HOUR) },
    ];
    const out = computeFirstResponseStats(inquiries, messages);
    expect(out.count).toBe(2);
    expect(out.avgMs).toBe(3 * HOUR);
    expect(out.formatted).toBe('3h');
  });

  it('ignores negative gaps from clock skew', () => {
    const inquiries = [
      { inquiry_id: 'a', created_at: at(10 * HOUR) }, // reply predates inquiry
      { inquiry_id: 'b', created_at: base },
    ];
    const messages = [
      { inquiry_id: 'a', created_at: at(2 * HOUR) }, // negative → dropped
      { inquiry_id: 'b', created_at: at(6 * HOUR) },
    ];
    const out = computeFirstResponseStats(inquiries, messages);
    expect(out.count).toBe(1);
    expect(out.avgMs).toBe(6 * HOUR);
  });

  it('tolerates missing / malformed rows', () => {
    expect(computeFirstResponseStats(null, null)).toEqual({
      avgMs: null,
      count: 0,
      formatted: null,
    });
    const inquiries = [{ inquiry_id: 'a', created_at: base }, {}, null];
    const messages = [{ inquiry_id: 'a', created_at: at(HOUR) }, { created_at: at(HOUR) }];
    const out = computeFirstResponseStats(inquiries, messages);
    expect(out.count).toBe(1);
    expect(out.formatted).toBe('1h');
  });
});
