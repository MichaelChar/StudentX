import { describe, it, expect } from 'vitest';
import { isJobDue } from '@/app/api/cron/cadence';

/** Build a Date with fixed UTC components (year/month unused for dueness). */
function utcDate({ hours = 0, minutes = 0, seconds = 0 } = {}) {
  return new Date(Date.UTC(2026, 0, 15, hours, minutes, seconds));
}

describe('isJobDue', () => {
  describe('5m cadence', () => {
    it('is due on minute 0', () => {
      expect(isJobDue('5m', utcDate({ hours: 12, minutes: 0 }))).toBe(true);
    });

    it('is due on minute 5', () => {
      expect(isJobDue('5m', utcDate({ hours: 12, minutes: 5 }))).toBe(true);
    });

    it('is due on minute 55', () => {
      expect(isJobDue('5m', utcDate({ hours: 12, minutes: 55 }))).toBe(true);
    });

    it('is not due one minute before a boundary (minute 4)', () => {
      expect(isJobDue('5m', utcDate({ hours: 12, minutes: 4 }))).toBe(false);
    });

    it('is not due one minute after a boundary (minute 6)', () => {
      expect(isJobDue('5m', utcDate({ hours: 12, minutes: 6 }))).toBe(false);
    });

    it('is not due on minute 59', () => {
      expect(isJobDue('5m', utcDate({ hours: 12, minutes: 59 }))).toBe(false);
    });
  });

  describe('15m cadence', () => {
    it('is due on minute 0', () => {
      expect(isJobDue('15m', utcDate({ hours: 8, minutes: 0 }))).toBe(true);
    });

    it('is due on the boundary minute 15', () => {
      expect(isJobDue('15m', utcDate({ hours: 8, minutes: 15 }))).toBe(true);
    });

    it('is due on minute 30 and 45', () => {
      expect(isJobDue('15m', utcDate({ hours: 8, minutes: 30 }))).toBe(true);
      expect(isJobDue('15m', utcDate({ hours: 8, minutes: 45 }))).toBe(true);
    });

    it('is not due one minute before the boundary (minute 14)', () => {
      expect(isJobDue('15m', utcDate({ hours: 8, minutes: 14 }))).toBe(false);
    });

    it('is not due one minute after the boundary (minute 16)', () => {
      expect(isJobDue('15m', utcDate({ hours: 8, minutes: 16 }))).toBe(false);
    });

    it('is not due on a 5m-only minute (minute 5)', () => {
      expect(isJobDue('15m', utcDate({ hours: 8, minutes: 5 }))).toBe(false);
    });
  });

  describe('daily@09:15 cadence', () => {
    it('is due exactly at 09:15 UTC (boundary minute)', () => {
      expect(isJobDue('daily@09:15', utcDate({ hours: 9, minutes: 15 }))).toBe(
        true,
      );
    });

    it('is not due one minute before (09:14)', () => {
      expect(isJobDue('daily@09:15', utcDate({ hours: 9, minutes: 14 }))).toBe(
        false,
      );
    });

    it('is not due one minute after (09:16)', () => {
      expect(isJobDue('daily@09:15', utcDate({ hours: 9, minutes: 16 }))).toBe(
        false,
      );
    });

    it('is not due at the same minute on another hour', () => {
      expect(isJobDue('daily@09:15', utcDate({ hours: 10, minutes: 15 }))).toBe(
        false,
      );
    });

    it('is not due at 09:00', () => {
      expect(isJobDue('daily@09:15', utcDate({ hours: 9, minutes: 0 }))).toBe(
        false,
      );
    });
  });

  describe('unknown / invalid cadences', () => {
    it('returns false for empty or unknown strings', () => {
      expect(isJobDue('', utcDate())).toBe(false);
      expect(isJobDue('hourly', utcDate())).toBe(false);
      expect(isJobDue('1m', utcDate())).toBe(false);
    });

    it('returns false for malformed daily@ values', () => {
      expect(isJobDue('daily@9:15', utcDate({ hours: 9, minutes: 15 }))).toBe(
        true,
      ); // 1-digit hour is accepted
      expect(isJobDue('daily@25:00', utcDate({ hours: 1, minutes: 0 }))).toBe(
        false,
      );
      expect(isJobDue('daily@09:99', utcDate({ hours: 9, minutes: 0 }))).toBe(
        false,
      );
    });
  });
});
