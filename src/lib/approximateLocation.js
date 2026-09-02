import { LOCATION_PRECISION } from '@/lib/transformListing';

/*
  The approximate-location circle — parity Feature 36.

  This module exists so the radius and the coarsening that makes it necessary
  can be checked against each other by a test, rather than living as two
  unrelated numbers in two files that drift apart.
*/

/** Metres per degree of latitude. Close enough at city scale. */
const METRES_PER_DEGREE_LAT = 111320;

/** Thessaloniki. Longitude degrees shrink by cos(latitude). */
const REFERENCE_LATITUDE = 40.64;

/**
 * Worst-case distance between a coarsened coordinate and the real one.
 *
 * transformListing rounds to `LOCATION_PRECISION` decimal places, so each axis
 * can be off by half a grid cell, and the worst case is the diagonal of that.
 *
 * @param {number} [precision=LOCATION_PRECISION]
 * @returns {number} metres
 */
export function coarseningOffsetMetres(precision = LOCATION_PRECISION) {
  const halfCell = 0.5 * 10 ** -precision;
  const lat = halfCell * METRES_PER_DEGREE_LAT;
  const lng =
    halfCell * METRES_PER_DEGREE_LAT * Math.cos((REFERENCE_LATITUDE * Math.PI) / 180);
  return Math.hypot(lat, lng);
}

/**
 * Radius of the circle drawn on the listing page, in metres.
 *
 * MUST stay larger than {@link coarseningOffsetMetres}. A student reads the
 * ring as "the home is somewhere in here", so a radius smaller than the
 * coarsening error would make that false — the circle would sometimes exclude
 * the actual address while looking authoritative.
 *
 * 200m clears the current ~70m error with room to spare and still reads as a
 * neighbourhood rather than a building, which is the honest claim: the exact
 * address is withheld until a booking is confirmed.
 */
export const APPROXIMATE_RADIUS_M = 200;
