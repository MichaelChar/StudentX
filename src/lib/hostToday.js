import { formatDuration } from '@/lib/landlordResponseTime';
import {
  isLandlordIdVerified,
  isListingSubmitted,
  isAdminLiveApproved,
  isVideoVerified,
} from '@/lib/listingGoLive';

/*
  The "Today" feed — parity Feature 49.

  Feature 49 deletes a six-tile metrics grid and puts an action list in its
  place. The spec's own justification is the audit: landlord response latency
  IS the conversion mechanism (average 1d 10h, and landlords race each other,
  not a timer). A metrics dashboard reports how a landlord did; an action list
  tells them what to do next. Today leads with "2 people are waiting on you",
  not CONVERSION RATE 0%.

  WHAT IS ACTUALLY IN THE DATA, as of building this.

  Airbnb's Today is a RESERVATIONS dashboard — "You have 1 reservation",
  "André's group of 2 stays for 5 more days". StudentX has exactly one row in
  `bookings` in the entire database and its state is `expired`. There has never
  been a live reservation. The reservation section below is therefore built and
  correct but unexercised, and it renders nothing at all today.

  What IS real is inquiries: five of them pending on the one active landlord.
  So the headline counts PEOPLE WAITING FOR A REPLY — an inquiry and a booking
  request are the same thing from the landlord's side, someone waiting — and
  the reservation cards appear underneath when reservations ever exist.

  This is the same data-gating that deferred Feature 54, except the action half
  of Feature 49 has real data to run on and Feature 54 had none at all.
*/

/** A booking the landlord has not yet answered. */
const BOOKING_NEEDS_REPLY = 'requested';

/** Booking states that represent a live, agreed stay. */
const BOOKING_LIVE_STATES = ['accepted', 'confirmed'];

/** An inquiry the landlord has not yet answered. */
const INQUIRY_NEEDS_REPLY = 'pending';

function timestamp(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Everything waiting on a reply, oldest first.
 *
 * Inquiries and booking requests are merged deliberately. From the landlord's
 * side they are one queue — a person who wrote and has not heard back — and
 * splitting them into two counters recreates the tile grid this feature
 * exists to delete.
 *
 * Pure. Exported for unit testing.
 *
 * `waitedMs` is attached here rather than computed at the call site, because
 * the call site is a React render and `Date.now()` is an impure call the React
 * Compiler rightly rejects there. Reading the clock once, in a plain module
 * function, also means every row on one screen is measured against the same
 * instant instead of drifting row by row.
 *
 * @param {{
 *   inquiries?: Array<{ inquiry_id?: string, status?: string, created_at?: string,
 *                       student_name?: string, listing_id?: string }>|null,
 *   bookings?: Array<{ booking_id?: string, state?: string, created_at?: string,
 *                      student_name?: string, listing_id?: string }>|null,
 * }} rows
 * @param {{ now?: number }} [opts]
 * @returns {Array<{ kind: 'inquiry'|'booking', id: string, listingId: string|null,
 *                   personName: string|null, createdAt: number, waitedMs: number }>}
 */
export function waitingOnReply({ inquiries, bookings } = {}, { now = Date.now() } = {}) {
  const out = [];

  for (const i of inquiries || []) {
    if (!i || i.status !== INQUIRY_NEEDS_REPLY) continue;
    const createdAt = timestamp(i.created_at);
    if (createdAt == null) continue;
    out.push({
      kind: 'inquiry',
      id: i.inquiry_id ?? null,
      listingId: i.listing_id ?? null,
      personName: i.student_name ?? null,
      createdAt,
    });
  }

  for (const b of bookings || []) {
    if (!b || b.state !== BOOKING_NEEDS_REPLY) continue;
    const createdAt = timestamp(b.created_at);
    if (createdAt == null) continue;
    out.push({
      kind: 'booking',
      id: b.booking_id ?? null,
      listingId: b.listing_id ?? null,
      personName: b.student_name ?? null,
      createdAt,
    });
  }

  // Oldest first: the longest-waiting person is the one costing a booking.
  out.sort((a, b) => a.createdAt - b.createdAt);
  // Clamped: a row stamped in the future must not render "-2h".
  for (const row of out) row.waitedMs = Math.max(0, now - row.createdAt);
  return out;
}

/**
 * The headline: how many people are waiting, and how long the worst one has.
 *
 * `longestWait` is a formatted string ("3d 4h") or null when nothing waits.
 * Returning the count rather than a sentence keeps the ICU plural in the
 * message catalogue where a translator can reach it.
 *
 * Pure. Exported for unit testing.
 *
 * @param {Array<{ createdAt: number }>} waiting  output of {@link waitingOnReply}
 * @param {{ now?: number }} [opts]
 * @returns {{ count: number, longestWait: string|null }}
 */
export function todayHeadline(waiting, { now = Date.now() } = {}) {
  const rows = waiting || [];
  if (rows.length === 0) return { count: 0, longestWait: null };

  const oldest = rows.reduce(
    (min, r) => (r.createdAt < min ? r.createdAt : min),
    rows[0].createdAt,
  );
  // Clock skew (a row stamped in the future) must not print "-2h".
  const elapsed = Math.max(0, now - oldest);
  return { count: rows.length, longestWait: formatDuration(elapsed) };
}

/**
 * The one thing standing between a listing and being publicly visible.
 *
 * Returns null for a listing with nothing outstanding. Every state derives
 * from `lib/listingGoLive.js` — this does NOT reimplement the gate, it only
 * decides which single blocker to name first, because a card that lists three
 * things at once tells the landlord nothing about what to do next.
 *
 * Order matters and is not arbitrary: ID verification is account-level and
 * unblocks every listing at once, so it outranks anything per-listing. Then
 * the landlord's own submission. Then the two things only someone else can
 * finish — the video call, then admin approval, which is pure waiting.
 *
 * Pure. Exported for unit testing.
 *
 * @param {{
 *   listing: object,
 *   isVerified: boolean,
 *   propertyVerifications?: Array|null,
 * }} args
 * @returns {{ blocker: 'id_check'|'submit'|'video_call'|'admin_review',
 *             actionable: boolean }|null}
 */
export function listingBlocker({ listing, isVerified, propertyVerifications }) {
  if (!listing) return null;
  // Already publicly visible — nothing outstanding, whatever the flags say.
  if (listing.listing_status === 'active') return null;

  if (!isLandlordIdVerified(isVerified)) {
    return { blocker: 'id_check', actionable: true };
  }
  if (!isListingSubmitted(listing)) {
    return { blocker: 'submit', actionable: true };
  }
  if (!isVideoVerified(propertyVerifications)) {
    return { blocker: 'video_call', actionable: true };
  }
  if (!isAdminLiveApproved(listing)) {
    /*
      Nothing for the landlord to do. It still earns a card — silence here is
      what makes a landlord email support to ask whether they are stuck.
    */
    return { blocker: 'admin_review', actionable: false };
  }
  return null;
}

/**
 * Reservations worth showing: live stays, soonest move-in first.
 *
 * Airbnb's Today shows current and upcoming stays. `expired`, `declined` and
 * `cancelled` are history and belong on the Reservations page, not on a screen
 * whose entire job is "what needs you now".
 *
 * Pure. Exported for unit testing.
 *
 * @param {Array<{ state?: string, move_in?: string }>|null} bookings
 * @returns {Array<object>}
 */
export function liveReservations(bookings) {
  return (bookings || [])
    .filter((b) => b && BOOKING_LIVE_STATES.includes(b.state))
    .slice()
    .sort((a, b) => (timestamp(a.move_in) ?? 0) - (timestamp(b.move_in) ?? 0));
}
