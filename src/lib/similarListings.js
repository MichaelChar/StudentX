/**
 * Rank other listings for the "Similar listings" rail on the detail page.
 *
 * Order: same neighbourhood first, then closest monthly_price to the
 * reference listing. Always excludes the current listing_id. Callers must
 * pass only ACTIVE candidates (listing_status = 'active' at query time).
 *
 * Pure — no DB access. Injectable for unit tests.
 */

/**
 * @param {Array<{ listing_id: string, neighborhood?: string|null, monthly_price?: number|null, listing_status?: string }>} candidates
 * @param {{ listing_id: string, neighborhood?: string|null, monthly_price?: number|null }} current
 * @param {number} [limit=4]
 * @returns {typeof candidates}
 */
export function rankSimilarListings(candidates, current, limit = 4) {
  if (!current?.listing_id || !Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const currentId = current.listing_id;
  const currentNbhd = current.neighborhood ?? null;
  const currentPrice =
    current.monthly_price != null && Number.isFinite(Number(current.monthly_price))
      ? Number(current.monthly_price)
      : null;

  const eligible = candidates.filter((row) => {
    if (!row || row.listing_id == null) return false;
    if (String(row.listing_id) === String(currentId)) return false;
    // Defensive: drop non-active even if the query already filtered.
    if (row.listing_status != null && row.listing_status !== 'active') return false;
    return true;
  });

  eligible.sort((a, b) => {
    const aSame = currentNbhd != null && a.neighborhood === currentNbhd ? 0 : 1;
    const bSame = currentNbhd != null && b.neighborhood === currentNbhd ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;

    const aPrice =
      a.monthly_price != null && Number.isFinite(Number(a.monthly_price))
        ? Number(a.monthly_price)
        : null;
    const bPrice =
      b.monthly_price != null && Number.isFinite(Number(b.monthly_price))
        ? Number(b.monthly_price)
        : null;

    // Null prices sort last within the neighbourhood tier.
    if (currentPrice == null) {
      if (aPrice == null && bPrice == null) return 0;
      if (aPrice == null) return 1;
      if (bPrice == null) return -1;
      return aPrice - bPrice;
    }
    if (aPrice == null && bPrice == null) return 0;
    if (aPrice == null) return 1;
    if (bPrice == null) return -1;
    const aDelta = Math.abs(aPrice - currentPrice);
    const bDelta = Math.abs(bPrice - currentPrice);
    if (aDelta !== bDelta) return aDelta - bDelta;
    // Stable tie-break for tests / SSR.
    return String(a.listing_id).localeCompare(String(b.listing_id));
  });

  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 4;
  return eligible.slice(0, n);
}
