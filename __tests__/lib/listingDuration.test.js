import { describe, it, expect } from 'vitest';
import {
  parseMinDuration,
  parseMaxDuration,
  validateDurationPair,
  MIN_DURATION_MONTHS,
  MAX_DURATION_MONTHS,
} from '@/lib/listingDuration';
import { parseAndValidateDurations } from '@/lib/listingWizardRules';

describe('parseMinDuration / parseMaxDuration', () => {
  it('accepts the full 1..12 range', () => {
    for (let n = MIN_DURATION_MONTHS; n <= MAX_DURATION_MONTHS; n++) {
      expect(parseMinDuration(n)).toBe(n);
      expect(parseMinDuration(String(n))).toBe(n);
      expect(parseMaxDuration(n)).toBe(n);
    }
  });

  it('accepts empty as null', () => {
    expect(parseMinDuration(null)).toBeNull();
    expect(parseMinDuration('')).toBeNull();
    expect(parseMinDuration(undefined)).toBeNull();
  });

  it('rejects values outside 1..12 (including the old enum-only illusion that 3 is invalid)', () => {
    // 3 was invalid under the old 1|5|9 enum — must be valid now
    expect(parseMinDuration(3)).toBe(3);
    expect(parseMinDuration(12)).toBe(12);

    for (const bad of [0, 13, 1.5, 'abc', NaN, -1]) {
      expect(() => parseMinDuration(bad)).toThrow(/min_duration_months/);
      expect(() => parseMaxDuration(bad)).toThrow(/max_duration_months/);
    }
  });

  it('rejects the legacy "only 1, 5, or 9" message path — 2 and 7 are legal', () => {
    expect(parseMinDuration(2)).toBe(2);
    expect(parseMinDuration(7)).toBe(7);
    expect(parseMinDuration(9)).toBe(9);
  });
});

describe('validateDurationPair', () => {
  it('allows max >= min', () => {
    expect(validateDurationPair(3, 9)).toBeNull();
    expect(validateDurationPair(5, 5)).toBeNull();
    expect(validateDurationPair(null, 9)).toBeNull();
    expect(validateDurationPair(3, null)).toBeNull();
  });

  it('rejects max < min', () => {
    expect(validateDurationPair(9, 3)?.error).toMatch(/max_duration_months/);
  });
});

describe('parseAndValidateDurations', () => {
  it('parses a valid pair', () => {
    const out = parseAndValidateDurations(5, 12);
    expect(out).toEqual({ min: 5, max: 12 });
  });

  it('surfaces pair errors', () => {
    const out = parseAndValidateDurations(10, 4);
    expect(out.error).toBeTruthy();
    expect(out.code).toBe('INVALID_DURATION_PAIR');
  });

  it('surfaces invalid singles', () => {
    const out = parseAndValidateDurations(99, null);
    expect(out.error).toMatch(/min_duration_months/);
  });
});
