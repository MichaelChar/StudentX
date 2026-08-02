/**
 * Booking state machine (offline MVP — no payment).
 *
 *   requested → accepted → confirmed → moved_in
 *        ↓          ↓           ↓
 *     declined   expired /   cancelled
 *                cancelled   disputed  (report a problem at/after move-in)
 *
 * Move-in "everything as promised" is a real transition: confirmed → moved_in
 * (migration 103). Silence is NOT confirmation — the student must act; the
 * daily move-in-prompt job emails while state stays `confirmed`.
 *
 * Availability blocks:
 *   - create request → insert `pending` block for [move_in, move_out]
 *   - accept         → convert that block to `booked`
 *   - decline / expire / cancel (while pending) → delete the pending block
 *   - cancel (while accepted/confirmed) → delete the booked block
 *   - moved_in does NOT release or alter the booked block
 *   - disputed keeps the booked block (ops holds the calendar)
 *
 * These helpers are pure where possible so tests can exercise every
 * terminal path that must release a block without hitting Supabase.
 */

import { datesOverlap } from '@/lib/bookingDates';

export const BOOKING_STATES = Object.freeze([
  'requested',
  'accepted',
  'confirmed',
  'moved_in',
  'declined',
  'expired',
  'cancelled',
  'disputed',
]);

export const TERMINAL_STATES = Object.freeze([
  'moved_in',
  'declined',
  'expired',
  'cancelled',
  'disputed',
]);

/**
 * States where the student/landlord may still cancel via the normal path.
 * `moved_in` also keeps the booked availability block but is terminal for
 * the offline MVP (no cancel transition).
 */
export const HOLDING_STATES = Object.freeze(['requested', 'accepted', 'confirmed']);

/** booking_events.metadata.kind for student move-in responses / prompts. */
export const MOVE_IN_OK_KIND = 'move_in_ok';
export const MOVE_IN_PROBLEM_KIND = 'move_in_problem';
export const MOVE_IN_PROMPT_KIND = 'move_in_prompt';

/**
 * Legal transitions: from → Set(to).
 * Offline MVP: accept goes requested → accepted; confirm accepted → confirmed
 * (landlord Accept may apply both in one API call).
 * confirmed → moved_in is "everything as promised"; confirmed → disputed is
 * "report a problem".
 */
const TRANSITIONS = {
  requested: new Set(['accepted', 'declined', 'expired', 'cancelled']),
  accepted: new Set(['confirmed', 'expired', 'cancelled']),
  confirmed: new Set(['moved_in', 'cancelled', 'disputed']),
  moved_in: new Set(),
  declined: new Set(),
  expired: new Set(),
  cancelled: new Set(),
  disputed: new Set(),
};

export function canTransition(fromState, toState) {
  const allowed = TRANSITIONS[fromState];
  return Boolean(allowed && allowed.has(toState));
}

/**
 * What to do with the availability block for a given transition.
 * Returns one of:
 *   { action: 'none' }
 *   { action: 'insert_pending' }
 *   { action: 'pending_to_booked' }
 *   { action: 'release_pending' }
 *   { action: 'release_booked' }
 */
export function blockActionForTransition(fromState, toState) {
  // Create path is not a transition from an existing row.
  if (fromState == null && toState === 'requested') {
    return { action: 'insert_pending' };
  }
  if (fromState === 'requested' && toState === 'accepted') {
    return { action: 'pending_to_booked' };
  }
  if (
    fromState === 'requested' &&
    (toState === 'declined' || toState === 'expired' || toState === 'cancelled')
  ) {
    return { action: 'release_pending' };
  }
  if (
    (fromState === 'accepted' || fromState === 'confirmed') &&
    (toState === 'cancelled' || toState === 'expired')
  ) {
    return { action: 'release_booked' };
  }
  // confirmed → moved_in keeps the booked block (stay is underway).
  return { action: 'none' };
}

/**
 * Build the booking row patch + event payload for a transition.
 * Pure — does not touch the DB.
 *
 * @returns {{ error?: string, patch?: object, event?: object, blockAction?: object }}
 */
export function planTransition({
  booking,
  toState,
  actor,
  now = new Date(),
  metadata = {},
}) {
  if (!booking) return { error: 'BOOKING_NOT_FOUND' };
  if (!BOOKING_STATES.includes(toState)) return { error: 'INVALID_STATE' };
  if (!['student', 'landlord', 'system', 'admin'].includes(actor)) {
    return { error: 'INVALID_ACTOR' };
  }
  if (!canTransition(booking.state, toState)) {
    return { error: 'ILLEGAL_TRANSITION' };
  }

  const iso = now.toISOString();
  const patch = {
    state: toState,
    last_activity_at: iso,
  };

  if (toState === 'accepted') patch.accepted_at = iso;
  if (toState === 'confirmed') patch.confirmed_at = iso;
  if (toState === 'declined') patch.declined_at = iso;
  if (toState === 'expired') patch.expired_at = iso;
  if (toState === 'cancelled') patch.cancelled_at = iso;
  if (toState === 'disputed') patch.disputed_at = iso;

  const event = {
    booking_id: booking.booking_id,
    from_state: booking.state,
    to_state: toState,
    actor,
    metadata: metadata || {},
  };

  const blockAction = blockActionForTransition(booking.state, toState);

  return { patch, event, blockAction };
}

/**
 * Offline accept: requested → accepted → confirmed in one plan list.
 * First step converts pending→booked; second has no block action.
 */
export function planOfflineAccept({
  booking,
  actor = 'landlord',
  now = new Date(),
  metadata = {},
}) {
  const first = planTransition({
    booking,
    toState: 'accepted',
    actor,
    now,
    metadata,
  });
  if (first.error) return first;

  const mid = {
    ...booking,
    state: 'accepted',
    accepted_at: first.patch.accepted_at,
    last_activity_at: first.patch.last_activity_at,
  };

  const second = planTransition({
    booking: mid,
    toState: 'confirmed',
    actor,
    now,
    metadata: { ...metadata, offline: true },
  });
  if (second.error) return second;

  return {
    steps: [
      { patch: first.patch, event: first.event, blockAction: first.blockAction },
      {
        patch: {
          state: 'confirmed',
          last_activity_at: second.patch.last_activity_at,
          accepted_at: first.patch.accepted_at,
          confirmed_at: second.patch.confirmed_at,
        },
        event: second.event,
        blockAction: second.blockAction,
      },
    ],
    finalState: 'confirmed',
  };
}

/** Rolling inactivity window: 2 days since last_activity_at. */
export const EXPIRY_MS = 2 * 24 * 60 * 60 * 1000;
/** Single landlord reminder at 24h of inactivity. */
export const REMINDER_MS = 1 * 24 * 60 * 60 * 1000;

/**
 * Whether a requested booking is past the rolling inactivity expiry.
 */
export function isExpiredByInactivity(booking, now = new Date()) {
  if (!booking || booking.state !== 'requested') return false;
  const last = booking.last_activity_at
    ? new Date(booking.last_activity_at).getTime()
    : 0;
  if (!last) return false;
  return now.getTime() - last >= EXPIRY_MS;
}

/**
 * Whether a requested booking is due a 24h landlord reminder.
 * Caller must also ensure no prior reminder event was recorded.
 */
export function isDueReminder(booking, now = new Date()) {
  if (!booking || booking.state !== 'requested') return false;
  const last = booking.last_activity_at
    ? new Date(booking.last_activity_at).getTime()
    : 0;
  if (!last) return false;
  const idle = now.getTime() - last;
  return idle >= REMINDER_MS && idle < EXPIRY_MS;
}

/**
 * Calendar date (YYYY-MM-DD) of `now` in UTC — matches move_in / move_out storage.
 */
export function utcDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Whether the booking's move-in calendar day has arrived (UTC).
 */
export function isMoveInDateReached(booking, now = new Date()) {
  if (!booking?.move_in || typeof booking.move_in !== 'string') return false;
  return booking.move_in <= utcDateString(now);
}

/**
 * Student may cancel while the stay still holds a calendar block.
 */
export function canStudentCancel(booking) {
  return Boolean(booking && HOLDING_STATES.includes(booking.state));
}

/**
 * In-app / email move-in prompt eligibility (pure booking fields only).
 * Confirmed + move-in reached. Bookings already in moved_in / disputed are
 * excluded by the state check (no event-log scan).
 */
export function isEligibleForMoveInPrompt(booking, now = new Date()) {
  if (!booking || booking.state !== 'confirmed') return false;
  return isMoveInDateReached(booking, now);
}

/**
 * Student may answer "everything as promised?" once move-in has arrived.
 */
export function canRespondToMoveIn(booking, now = new Date()) {
  return isEligibleForMoveInPrompt(booking, now);
}

/**
 * Whether the student has already answered the move-in prompt.
 * Prefer this over scanning booking_events — state is authoritative after 103.
 */
export function hasAnsweredMoveIn(booking) {
  return Boolean(
    booking && (booking.state === 'moved_in' || booking.state === 'disputed'),
  );
}

/**
 * Plan "move-in ok" — confirmed → moved_in with metadata.kind = move_in_ok.
 * Does not release or alter the availability block.
 * Pure — does not touch the DB.
 */
export function planMoveInOk({
  booking,
  actor = 'student',
  now = new Date(),
  metadata = {},
}) {
  if (!booking) return { error: 'BOOKING_NOT_FOUND' };
  if (!['student', 'admin', 'system'].includes(actor)) {
    return { error: 'INVALID_ACTOR' };
  }
  if (!isMoveInDateReached(booking, now)) return { error: 'MOVE_IN_NOT_REACHED' };

  return planTransition({
    booking,
    toState: 'moved_in',
    actor,
    now,
    metadata: { kind: MOVE_IN_OK_KIND, ...(metadata || {}) },
  });
}

/**
 * Plan "report a problem" — confirmed → disputed with free-text description.
 * Pure — does not touch the DB.
 */
export function planMoveInProblem({
  booking,
  actor = 'student',
  now = new Date(),
  description,
  metadata = {},
}) {
  if (!booking) return { error: 'BOOKING_NOT_FOUND' };
  if (!['student', 'admin', 'system'].includes(actor)) {
    return { error: 'INVALID_ACTOR' };
  }
  if (booking.state !== 'confirmed') return { error: 'ILLEGAL_TRANSITION' };
  if (!isMoveInDateReached(booking, now)) return { error: 'MOVE_IN_NOT_REACHED' };

  const text =
    typeof description === 'string' ? description.trim() : '';
  if (text.length < 10) {
    return { error: 'INVALID_INPUT', message: 'description must be at least 10 characters' };
  }
  if (text.length > 4000) {
    return { error: 'INVALID_INPUT', message: 'description must be at most 4000 characters' };
  }

  return planTransition({
    booking,
    toState: 'disputed',
    actor,
    now,
    metadata: {
      kind: MOVE_IN_PROBLEM_KIND,
      description: text,
      ...(metadata || {}),
    },
  });
}

/**
 * Apply a blockAction against an in-memory block list (for tests).
 * blocks: [{ block_id, listing_id, start_date, end_date, kind }]
 * stay: { listing_id, move_in, move_out }
 * Returns a new array.
 */
export function applyBlockAction(blocks, blockAction, stay) {
  const list = Array.isArray(blocks) ? [...blocks] : [];
  const { listing_id, move_in, move_out } = stay;
  const match = (b) =>
    b.listing_id === listing_id &&
    b.start_date === move_in &&
    b.end_date === move_out;

  switch (blockAction?.action) {
    case 'insert_pending':
      list.push({
        block_id: blockAction.block_id || `pending-${listing_id}-${move_in}`,
        listing_id,
        start_date: move_in,
        end_date: move_out,
        kind: 'pending',
      });
      return list;
    case 'pending_to_booked':
      return list.map((b) =>
        match(b) && b.kind === 'pending' ? { ...b, kind: 'booked' } : b,
      );
    case 'release_pending':
      return list.filter((b) => !(match(b) && b.kind === 'pending'));
    case 'release_booked':
      return list.filter((b) => !(match(b) && b.kind === 'booked'));
    default:
      return list;
  }
}

/**
 * Whether any pending/booked block overlaps the requested stay.
 */
export function hasBlockingOverlap(blocks, listingId, moveIn, moveOut) {
  return (blocks || []).some(
    (b) =>
      b.listing_id === listingId &&
      (b.kind === 'pending' || b.kind === 'booked') &&
      datesOverlap(b.start_date, b.end_date, moveIn, moveOut),
  );
}
