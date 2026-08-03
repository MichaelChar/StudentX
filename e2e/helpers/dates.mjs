/** UTC calendar helpers for booking date ranges. */

export function utcYmd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function addUtcDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcYmd(d);
}

export function addUtcMonths(ymd, months) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return utcYmd(d);
}

/** Future stay window safe for request→accept flows (no move-in prompt yet). */
export function futureStayWindow() {
  const moveIn = addUtcDays(utcYmd(), 45);
  const moveOut = addUtcMonths(moveIn, 4);
  return { moveIn, moveOut };
}

/**
 * Stay whose move-in is already past — after landlord accept the student
 * should see the "Is everything as promised?" prompt.
 */
export function pastMoveInStayWindow() {
  const moveIn = addUtcDays(utcYmd(), -3);
  const moveOut = addUtcMonths(moveIn, 4);
  return { moveIn, moveOut };
}
