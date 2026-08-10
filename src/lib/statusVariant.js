/**
 * Status → Pill variant mapping, in one place.
 *
 * These were previously duplicated five times: two copies for inquiry status
 * (landlord inquiries page + an inline const on the landlord dashboard) and
 * three for booking state (landlord reservations, StudentBookingCard,
 * StudentBookingDetail).
 *
 * The copies had drifted. `disputed` mapped to `pending` on both student
 * surfaces but was absent from the landlord's reservations mapper, so it fell
 * through to `amenity` — neutral parchment, visually identical to `cancelled`
 * and `expired`. A dispute freezes escrow and blocks the payout, and the
 * landlord is the party who has to act on it, so the one surface that needed
 * to flag it was the one that did not.
 *
 * Presentation only. Domain rules stay in `bookingState.js`; this module
 * imports BOOKING_STATES purely so the mapping cannot silently fall out of
 * sync with the state machine.
 */

import { BOOKING_STATES } from '@/lib/bookingState';

/**
 * Pill variant for a booking state.
 *
 *   pending  (magenta)   needs someone to act
 *   info     (blue)      live and progressing
 *   amenity  (parchment) terminal and neutral
 *
 * @param {string} state one of BOOKING_STATES
 * @returns {'pending'|'info'|'amenity'}
 */
export function bookingStateVariant(state) {
  switch (state) {
    // Awaiting a decision from the landlord.
    case 'requested':
      return 'pending';
    // Escrow is frozen and the payout is blocked until this is resolved.
    // Must read as urgent on BOTH sides — this is the bug that prompted the
    // consolidation.
    case 'disputed':
      return 'pending';
    case 'accepted':
    case 'confirmed':
    case 'moved_in':
      return 'info';
    case 'declined':
    case 'expired':
    case 'cancelled':
      return 'amenity';
    default:
      return 'amenity';
  }
}

/**
 * Booking states that should read as urgent. Exported so a caller can badge or
 * count them without re-deriving the rule from the variant.
 */
export const URGENT_BOOKING_STATES = Object.freeze(
  BOOKING_STATES.filter((s) => bookingStateVariant(s) === 'pending')
);

/**
 * Pill variant for an inquiry status.
 *
 * @param {string} status
 * @returns {'pending'|'info'|'amenity'}
 */
export function inquiryStatusVariant(status) {
  if (status === 'pending') return 'pending';
  if (status === 'replied') return 'info';
  return 'amenity';
}
