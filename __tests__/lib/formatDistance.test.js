import { describe, it, expect } from 'vitest';
import { formatDistance } from '@/lib/formatDistance';

describe('formatDistance', () => {
  it('rounds sub-kilometre values to the nearest 50 m', () => {
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(437)).toBe('450 m');
    expect(formatDistance(424)).toBe('400 m');
    expect(formatDistance(999)).toBe('1000 m');
  });

  it('never rounds a real distance down to "0 m"', () => {
    // The landlord typed something; showing "0 m" would read as a bug.
    expect(formatDistance(1)).toBe('50 m');
    expect(formatDistance(24)).toBe('50 m');
  });

  it('switches to one-decimal km at a kilometre', () => {
    expect(formatDistance(1000)).toBe('1 km');
    expect(formatDistance(1247)).toBe('1.2 km');
    expect(formatDistance(6400)).toBe('6.4 km');
  });

  it('drops a trailing .0', () => {
    expect(formatDistance(12000)).toBe('12 km');
    expect(formatDistance(2000)).toBe('2 km');
  });

  it('returns null for anything unrenderable', () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
    expect(formatDistance(0)).toBeNull();
    expect(formatDistance(-5)).toBeNull();
    expect(formatDistance('450')).toBeNull();
    expect(formatDistance(NaN)).toBeNull();
    expect(formatDistance(Infinity)).toBeNull();
  });
});
