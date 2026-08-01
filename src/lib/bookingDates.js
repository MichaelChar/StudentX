/**
 * Pure date helpers for the booking MVP (move-in / move-out ranges).
 * All dates are calendar dates in YYYY-MM-DD (UTC midnight).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a YYYY-MM-DD string into a UTC Date, or null if invalid / impossible.
 */
export function parseISODate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

/**
 * Inclusive day count between two YYYY-MM-DD dates (move_out − move_in).
 * Returns null if either date is invalid.
 */
export function daySpan(moveIn, moveOut) {
  const a = parseISODate(moveIn);
  const b = parseISODate(moveOut);
  if (!a || !b) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Stay length in months, DISPLAY precision (days / 30, one decimal).
 * Use for labels and min/max-duration fit checks — never for money.
 */
export function stayDurationMonths(moveIn, moveOut) {
  const days = daySpan(moveIn, moveOut);
  if (days == null || days <= 0) return null;
  return Math.round((days / 30) * 10) / 10;
}

/**
 * Stay length in months, EXACT (days / 30, unrounded).
 *
 * Billing is per-day with the monthly price covering 30 days, so a 45-day
 * stay is 1.5 months' rent and a 31-day month costs more than a 28-day one.
 * Rounding to one decimal before multiplying drifts up to 1.5 days of rent
 * (±€22.50 on a €450 listing) away from that rule — and the result is
 * persisted as bookings.total_stay_value, which later becomes the commission
 * base. Money must be derived from this, not from stayDurationMonths().
 */
export function stayDurationMonthsExact(moveIn, moveOut) {
  const days = daySpan(moveIn, moveOut);
  if (days == null || days <= 0) return null;
  return days / 30;
}

/**
 * Validate move_in / move_out pair. Returns { error } or { moveIn, moveOut, months }.
 */
export function parseStayRange(moveInRaw, moveOutRaw) {
  const moveIn = typeof moveInRaw === 'string' ? moveInRaw.trim() : '';
  const moveOut = typeof moveOutRaw === 'string' ? moveOutRaw.trim() : '';
  if (!moveIn || !moveOut) {
    return { error: 'move_in and move_out are required (YYYY-MM-DD)' };
  }
  if (!parseISODate(moveIn)) {
    return { error: 'move_in must be a valid date in YYYY-MM-DD format' };
  }
  if (!parseISODate(moveOut)) {
    return { error: 'move_out must be a valid date in YYYY-MM-DD format' };
  }
  const months = stayDurationMonths(moveIn, moveOut);
  if (months == null || months <= 0) {
    return { error: 'move_out must be after move_in' };
  }
  // `months` is display-rounded; `monthsExact` is what money must be based on.
  return { moveIn, moveOut, months, monthsExact: stayDurationMonthsExact(moveIn, moveOut) };
}

/**
 * Whether [aStart, aEnd] overlaps [bStart, bEnd] on an inclusive calendar basis.
 */
export function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && aEnd >= bStart;
}

/**
 * Whether a listing's advertised window covers [moveIn, moveOut].
 * available_from / available_to null = open-ended on that side.
 */
export function listingCoversStay(listing, moveIn, moveOut) {
  const from = listing.available_from ?? null;
  const to = listing.available_to ?? null;
  if (from && from > moveIn) return false;
  if (to && to < moveOut) return false;
  return true;
}

/**
 * Whether stay length fits the listing's min/max duration (months).
 * Null min/max = no constraint on that side.
 */
export function durationFitsListing(listing, months) {
  if (months == null || months <= 0) return false;
  const min = listing.min_duration_months;
  const max = listing.max_duration_months;
  if (min != null && months < Number(min)) return false;
  if (max != null && months > Number(max)) return false;
  return true;
}

/**
 * Cost summary for the booking widget (offline settlement — no platform charge).
 */
export function costSummary({
  monthlyRent,
  months,
  monthsExact,
  deposit = 0,
  agencyFee = 0,
}) {
  const rent = Number(monthlyRent) || 0;
  const m = Number(months) || 0;
  // Price off the exact day count when available; `months` is display-rounded
  // and using it here drifts the total away from the per-day billing rule.
  const billable = Number(monthsExact ?? months) || 0;
  const totalRent = Math.round(rent * billable * 100) / 100;
  const dep = Number(deposit) || 0;
  const agency = Number(agencyFee) || 0;
  const dueAtMoveIn = Math.round((dep + agency) * 100) / 100;
  return {
    monthly_rent: rent,
    duration_months: m,
    total_rent: totalRent,
    deposit: dep,
    agency_fee: agency,
    due_at_move_in: dueAtMoveIn,
  };
}
