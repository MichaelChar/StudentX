import { describe, it, expect } from 'vitest';
import {
  APPROXIMATE_RADIUS_M,
  coarseningOffsetMetres,
} from '@/lib/approximateLocation';
import { LOCATION_PRECISION } from '@/lib/transformListing';

/*
  The safety property of Feature 36.

  The circle is a claim: "the home is somewhere in here". transformListing
  displaces the public coordinate from the real one, so the circle is only
  honest while its radius exceeds that displacement. These are two numbers in
  two files, and nothing but this test stops them drifting apart — a later
  change to LOCATION_PRECISION (or someone shrinking the circle because it
  "looks too big") would silently turn the map into a lie that still looks
  authoritative.
*/
describe('approximate-location circle', () => {
  it('is larger than the worst-case coarsening offset', () => {
    expect(APPROXIMATE_RADIUS_M).toBeGreaterThan(coarseningOffsetMetres());
  });

  it('keeps a real margin, not a hairline pass', () => {
    // Guards the spirit as well as the letter: a radius 1m over the offset
    // would satisfy the assertion above and still be indefensible.
    expect(APPROXIMATE_RADIUS_M).toBeGreaterThan(coarseningOffsetMetres() * 2);
  });

  it('computes ~70m for the current 3dp precision', () => {
    expect(LOCATION_PRECISION).toBe(3);
    expect(coarseningOffsetMetres()).toBeGreaterThan(65);
    expect(coarseningOffsetMetres()).toBeLessThan(75);
  });

  /*
    Fewer decimal places means a coarser grid and a BIGGER offset. If anyone
    relaxes the precision to 2dp the offset jumps ten-fold and blows past the
    current radius — this is the case that must fail loudly rather than ship.
  */
  it('would be violated by a coarser grid, and says so', () => {
    const at2dp = coarseningOffsetMetres(2);
    expect(at2dp).toBeGreaterThan(APPROXIMATE_RADIUS_M);
  });

  it('a finer grid stays comfortably inside the circle', () => {
    expect(coarseningOffsetMetres(4)).toBeLessThan(APPROXIMATE_RADIUS_M);
  });

  it('reads as a neighbourhood, not a building', () => {
    // A 25m circle would pick out a single building and defeat the feature.
    expect(APPROXIMATE_RADIUS_M).toBeGreaterThanOrEqual(150);
  });
});
