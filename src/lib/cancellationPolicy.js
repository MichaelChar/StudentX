/**
 * Display-only cancellation policy tiers for student housing bookings.
 *
 * No refund logic is wired to bookings or payments yet. These constants
 * power static copy on the listing detail page and the booking widget.
 *
 * Tiers are evaluated against days remaining before move-in (not calendar
 * months). Display lists free → half only.
 */

/** Full refund when cancelling more than this many days before move-in. */
export const FREE_CANCEL_DAYS = 60;

/** Half refund when cancelling at least this many days before move-in (and ≤ FREE). */
export const HALF_REFUND_DAYS = 30;

/**
 * @typedef {{ id: string, minDaysBeforeMoveIn: number, refundPercent: number }} CancellationTier
 */

/** @type {readonly CancellationTier[]} */
export const CANCELLATION_TIERS = Object.freeze([
  {
    id: 'free',
    minDaysBeforeMoveIn: FREE_CANCEL_DAYS,
    refundPercent: 100,
  },
  {
    id: 'half',
    minDaysBeforeMoveIn: HALF_REFUND_DAYS,
    refundPercent: 50,
  },
]);

/** Zero-refund outcome for stays inside HALF_REFUND_DAYS (not shown in UI). */
const NONE_TIER = Object.freeze({
  id: 'none',
  minDaysBeforeMoveIn: 0,
  refundPercent: 0,
});

/**
 * Resolve which tier applies for a stay starting `daysUntilMoveIn` days out.
 * Pure helper for tests / future wiring — display code iterates CANCELLATION_TIERS.
 *
 * @param {number} daysUntilMoveIn  whole days from today to move-in (≥ 0)
 * @returns {CancellationTier}
 */
export function tierForDaysUntilMoveIn(daysUntilMoveIn) {
  const days =
    typeof daysUntilMoveIn === 'number' && Number.isFinite(daysUntilMoveIn)
      ? Math.max(0, daysUntilMoveIn)
      : 0;
  // More than 60 → free; 30–60 inclusive lower bound of half → half; else none.
  // "Free more than 60 days" means days > 60, not >= 60.
  if (days > FREE_CANCEL_DAYS) return CANCELLATION_TIERS[0];
  if (days >= HALF_REFUND_DAYS) return CANCELLATION_TIERS[1];
  return NONE_TIER;
}
