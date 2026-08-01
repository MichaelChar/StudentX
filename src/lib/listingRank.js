/**
 * Public search ranking for /api/listings.
 *
 * Keys (highest priority first):
 *   1. landlords.is_verified (true first)
 *   2. listing completeness (photos, description, amenities, sqm, floor)
 *   3. landlord avg_response_ms (faster first; NULL last)
 *   4. student's chosen metric (price / walk / transit)
 *   5. listing_id newest-first tiebreaker
 *
 * Pure — exported for unit tests (NULL-last response time, etc.).
 */

import { listingCompleteness } from '@/lib/transformListing';

function metricValue(listing, sortBy) {
  if (sortBy === 'price') return listing.monthly_price;
  if (sortBy === 'walk_minutes') {
    return listing.faculty_distances?.[0]?.walk_minutes ?? null;
  }
  if (sortBy === 'transit_minutes') {
    return listing.faculty_distances?.[0]?.transit_minutes ?? null;
  }
  return null;
}

/**
 * Comparator for Array.prototype.sort.
 *
 * @param {object} a
 * @param {object} b
 * @param {{ sortBy?: string|null, sortOrder?: string|null }} [opts]
 * @returns {number}
 */
export function compareListingsByRank(a, b, opts = {}) {
  const sortBy = opts.sortBy ?? null;
  const sortOrder = opts.sortOrder ?? 'asc';

  const aVerified = a.is_verified === true;
  const bVerified = b.is_verified === true;
  if (aVerified !== bVerified) return aVerified ? -1 : 1;

  const aComplete = listingCompleteness(a);
  const bComplete = listingCompleteness(b);
  if (aComplete !== bComplete) return bComplete - aComplete;

  // Faster response first; NULL sorts last (no response-time data yet).
  const aRt = a.avg_response_ms;
  const bRt = b.avg_response_ms;
  if (aRt != null || bRt != null) {
    if (aRt == null) return 1;
    if (bRt == null) return -1;
    if (aRt !== bRt) return aRt - bRt;
  }

  const valA = metricValue(a, sortBy);
  const valB = metricValue(b, sortBy);
  if (valA != null || valB != null) {
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (valA !== valB) return sortOrder === 'desc' ? valB - valA : valA - valB;
  }

  // Deterministic tiebreaker: newest first (listing_id grows with recency).
  if (a.listing_id === b.listing_id) return 0;
  return a.listing_id < b.listing_id ? 1 : -1;
}
