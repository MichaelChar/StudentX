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
 * Stay length in months for fee / min-duration checks.
 * Uses days / 30, rounded to one decimal (e.g. 150 days → 5.0).
 */
export function stayDurationMonths(moveIn, moveOut) {
  const days = daySpan(moveIn, moveOut);
  if (days == null || days <= 0) return null;
  return Math.round((days / 30) * 10) / 10;
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
  return { moveIn, moveOut, months };
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
export function costSummary({ monthlyRent, months, deposit = 0, agencyFee = 0 }) {
  const rent = Number(monthlyRent) || 0;
  const m = Number(months) || 0;
  const totalRent = Math.round(rent * m * 100) / 100;
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
