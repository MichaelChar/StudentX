/**
 * Pure validation rules for the landlord listing wizard.
 * Shared by the client form and unit tests.
 */

import { MIN_UNIVERSITY_DISTANCES } from '@/lib/universityDistances';
import {
  parseMinDuration,
  parseMaxDuration,
  validateDurationPair,
} from '@/lib/listingDuration';

export const MIN_PHOTOS = 5;
export const PHOTO_LIMIT = 20;

/** Property-type names that must never appear in the form dropdown. */
export const EXCLUDED_PROPERTY_TYPES = new Set(['2-Bedroom (x2)']);

/** Amenity names that duplicate a Floor value — hide from the amenity grid. */
export const EXCLUDED_AMENITY_NAMES = new Set(['Ground floor']);

/**
 * @param {Array<{ university_id?: string, distance_meters?: unknown }>} rows
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateUniversityDistancesMandatory(rows) {
  if (!Array.isArray(rows) || rows.length < MIN_UNIVERSITY_DISTANCES) {
    return {
      ok: false,
      error: `At least ${MIN_UNIVERSITY_DISTANCES} university distances are required`,
    };
  }
  const filled = rows.filter((r) => {
    const raw = r?.distance_meters;
    const n = typeof raw === 'string' ? Number(raw.trim()) : Number(raw);
    return Number.isInteger(n) && n > 0;
  });
  if (filled.length < MIN_UNIVERSITY_DISTANCES) {
    return {
      ok: false,
      error: `At least ${MIN_UNIVERSITY_DISTANCES} university distances are required`,
    };
  }
  return { ok: true };
}

/**
 * @param {unknown[]} photos
 * @param {unknown[]} [external]
 */
export function validatePhotoMinimum(photos, external = []) {
  const uploaded = Array.isArray(photos) ? photos.length : 0;
  const ext = Array.isArray(external) ? external.length : 0;
  const total = uploaded + ext;
  if (total < MIN_PHOTOS) {
    return {
      ok: false,
      error: `At least ${MIN_PHOTOS} photos are required (you have ${total})`,
    };
  }
  if (total > PHOTO_LIMIT) {
    return {
      ok: false,
      error: `Listings are limited to ${PHOTO_LIMIT} photos`,
    };
  }
  return { ok: true };
}

/**
 * Coordinates are required on every wizard save that touches location.
 * Mirrors the DB sanity CHECK (location_coords_sane / migration 106):
 * finite, in-range, and not Null Island (0, 0).
 */
export function validateRequiredCoords(lat, lng) {
  const la = lat === '' || lat == null ? NaN : Number(lat);
  const ln = lng === '' || lng == null ? NaN : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    return { ok: false, error: 'lat and lng are required' };
  }
  if (la < -90 || la > 90 || ln < -180 || ln > 180) {
    return { ok: false, error: 'lat and lng must be valid coordinates' };
  }
  if (la === 0 && ln === 0) {
    return { ok: false, error: 'lat and lng must be valid coordinates' };
  }
  return { ok: true, lat: la, lng: ln };
}

/**
 * Parse + pair-check durations for API routes.
 * @returns {{ min: number|null, max: number|null } | { error: string, code: string }}
 */
export function parseAndValidateDurations(minRaw, maxRaw) {
  try {
    const min = minRaw === undefined ? undefined : parseMinDuration(minRaw);
    const max = maxRaw === undefined ? undefined : parseMaxDuration(maxRaw);
    if (min !== undefined && max !== undefined) {
      const pair = validateDurationPair(min, max);
      if (pair) return { error: pair.error, code: 'INVALID_DURATION_PAIR' };
    }
    return {
      min: min === undefined ? undefined : min,
      max: max === undefined ? undefined : max,
    };
  } catch (err) {
    return { error: err.message, code: err.code || 'INVALID_DURATION' };
  }
}
