// ~1 cm. Coordinates round-trip through Postgres `numeric` and JSON, so a
// resave of an unmoved pin must not count as a move.
const EPSILON = 1e-7;

/**
 * True when a write supplies coordinates that differ from the stored ones.
 * A write without coordinates never counts; a first pin (nothing stored) does.
 *
 * Its own module, with no imports, so the client listing form can use it
 * without bundling the server-side re-measure in listingPinMove.js.
 *
 * @param {{ lat?: unknown, lng?: unknown } | null | undefined} stored
 * @param {{ lat?: unknown, lng?: unknown }} next
 */
export function coordsChanged(stored, next) {
  if (next?.lat === undefined && next?.lng === undefined) return false;
  const nextLat = Number(next.lat ?? stored?.lat);
  const nextLng = Number(next.lng ?? stored?.lng);
  if (stored?.lat == null || stored?.lng == null) {
    return Number.isFinite(nextLat) && Number.isFinite(nextLng);
  }
  return (
    Math.abs(Number(stored.lat) - nextLat) > EPSILON ||
    Math.abs(Number(stored.lng) - nextLng) > EPSILON
  );
}
