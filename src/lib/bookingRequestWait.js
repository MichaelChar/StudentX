import { EXPIRY_MS } from '@/lib/bookingState';

/*
  What a student sees while a booking request is pending — parity Feature 44.

  THE AUDIT IS THE WHOLE ARGUMENT. Nostus killed roughly 87% of requests on a
  silent two-day inactivity timer. The planned fix is host-side (a 24h reminder
  instead of silent expiry), but that leaves the student side untouched — and
  the student is the one who walks. Someone who can see "the landlord has 36
  hours left to reply" waits; someone staring at nothing books elsewhere.

  So this exists to turn an invisible timer into a visible one.

  THE DEADLINE IS DERIVED, NOT STORED. `bookings` has no `expires_at`: expiry
  is a ROLLING two days from `last_activity_at` (see bookingState.js), which
  moves every time either side does something. That is why this computes the
  deadline rather than reading it, and why the countdown can legitimately go
  UP — a landlord viewing or messaging resets it. Showing a stored deadline
  would be simpler and would lie.
*/

/** Below this, the wait is framed as urgent rather than merely counted. */
export const URGENT_MS = 12 * 60 * 60 * 1000;

/**
 * When this request lapses if nobody touches it.
 *
 * Only meaningful for a `requested` booking — every other state has either
 * resolved or already lapsed, and offering a deadline for them would be noise.
 *
 * Pure — exported for unit testing.
 *
 * @param {{ state?: string, last_activity_at?: string|null }|null} booking
 * @returns {number|null} epoch ms, or null when no deadline applies
 */
export function requestExpiresAt(booking) {
  if (!booking || booking.state !== 'requested') return null;
  if (!booking.last_activity_at) return null;
  const last = new Date(booking.last_activity_at).getTime();
  if (!Number.isFinite(last)) return null;
  return last + EXPIRY_MS;
}

/**
 * How long the landlord has left, and how loudly to say it.
 *
 * `msLeft` is clamped at zero: a request past its deadline that the cron has
 * not yet swept must read as "out of time", never as a negative countdown.
 *
 * @param {object|null} booking
 * @param {{ now?: number }} [opts]
 * @returns {{ expiresAt: number, msLeft: number, hoursLeft: number,
 *             urgent: boolean, lapsed: boolean }|null}
 */
export function requestWait(booking, { now = Date.now() } = {}) {
  const expiresAt = requestExpiresAt(booking);
  if (expiresAt == null) return null;

  const msLeft = Math.max(0, expiresAt - now);
  return {
    expiresAt,
    msLeft,
    // Rounded UP: with 90 minutes left, "2 hours" is a kinder and more
    // accurate prompt than "1 hour", which reads as almost gone.
    hoursLeft: Math.ceil(msLeft / (60 * 60 * 1000)),
    urgent: msLeft > 0 && msLeft <= URGENT_MS,
    lapsed: msLeft === 0,
  };
}

/**
 * The message key and params for the student-facing wait line.
 *
 * Returns keys rather than copy so next-intl stays the only place strings
 * live. Null when there is nothing to say.
 *
 * Deliberately three shapes rather than one with a number in it: "The landlord
 * has 2 days to reply" is reassuring, "…has 6 hours left" is a prompt, and
 * "out of time" is neither — they are different messages, not one message with
 * a variable.
 *
 * @param {object|null} booking
 * @param {{ now?: number }} [opts]
 * @returns {{ key: string, params: object }|null}
 */
export function requestWaitMessage(booking, opts) {
  const wait = requestWait(booking, opts);
  if (!wait) return null;
  if (wait.lapsed) return { key: 'waitLapsed', params: {} };
  if (wait.urgent) return { key: 'waitHours', params: { hours: wait.hoursLeft } };

  const days = Math.ceil(wait.msLeft / (24 * 60 * 60 * 1000));
  return days > 1
    ? { key: 'waitDays', params: { days } }
    : { key: 'waitHours', params: { hours: wait.hoursLeft } };
}
