/**
 * Listings whose prices were estimated (not provided by the landlord).
 * When real prices are added for new listings, they won't appear here.
 */
const ESTIMATED_LISTING_IDS = new Set([
  '0100001', '0100002', '0100003', '0100004', '0100005', '0100006',
  '0101001', '0101002', '0101003', '0101004', '0101005', '0101006',
]);

export function isEstimatedPrice(listingId) {
  return ESTIMATED_LISTING_IDS.has(listingId);
}
