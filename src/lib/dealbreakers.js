// Quiz/results dealbreakers, re-applied to transformed listings. Mirrors the
// translation in results/page.js#fetchListings:
//   - unfurnished / no_ac  → require the "Furnished" / "AC" amenity
//   - ground_floor         → exclude floor 0 and the "ground floor" amenity tag
//                            (NULL floors are kept — not every listing records
//                            one; surfaced separately by the "floor not
//                            specified" badge)
//   - bills_not_included   → require bills_included
//
// Used by the saved-searches digest so a digest never emails a listing the
// student explicitly ruled out (#101). Operates on the flat transformListing
// shape, so it needs `floor`, `bills_included`, and `amenities` populated.
const REQUIRED_AMENITY = { unfurnished: 'Furnished', no_ac: 'AC' };

export function applyDealbreakers(listings, dealbreakers) {
  if (!Array.isArray(dealbreakers) || dealbreakers.length === 0) return listings;

  const requiredAmenities = dealbreakers
    .map((d) => REQUIRED_AMENITY[d])
    .filter(Boolean)
    .map((a) => a.toLowerCase());
  const excludeGroundFloor = dealbreakers.includes('ground_floor');
  const requireBillsIncluded = dealbreakers.includes('bills_not_included');

  return listings.filter((listing) => {
    const have = (listing.amenities || []).map((a) => a.toLowerCase());
    if (!requiredAmenities.every((a) => have.includes(a))) return false;
    if (requireBillsIncluded && listing.bills_included !== true) return false;
    if (excludeGroundFloor && (listing.floor === 0 || have.includes('ground floor'))) return false;
    return true;
  });
}
