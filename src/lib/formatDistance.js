/**
 * Formats a landlord-reported distance in metres for display.
 *
 * Rounds deliberately. The underlying number is typed by a landlord into a free
 * text field — it is an estimate, not a measurement — so rendering "1,247 m"
 * would imply a precision nobody ever had. Under a kilometre we round to the
 * nearest 50 m; at or above, one decimal place of km.
 *
 *   450   → "450 m"
 *   1247  → "1.2 km"
 *   12000 → "12 km"
 *
 * @param {number|null|undefined} meters
 * @returns {string|null} formatted string, or null if there is nothing to show
 */
export function formatDistance(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) {
    return null;
  }

  if (meters < 1000) {
    const rounded = Math.round(meters / 50) * 50;
    // Guard the 0–24 m range, which would otherwise round down to "0 m".
    return `${rounded === 0 ? 50 : rounded} m`;
  }

  const km = meters / 1000;
  // Drop a trailing ".0" — "12 km" reads better than "12.0 km".
  const text = km.toFixed(1).replace(/\.0$/, '');
  return `${text} km`;
}
