/**
 * Min/max stay duration helpers for landlord listing writes.
 *
 * DB (migration 100) permits 1..12 months for both columns, with
 * max >= min when both set. The old API enum {1,5,9} is retired.
 */

export const MIN_DURATION_MONTHS = 1;
export const MAX_DURATION_MONTHS = 12;

/**
 * Coerce a form/API value into a SMALLINT month count in 1..12, or null.
 * Throws with code INVALID_MIN_DURATION / INVALID_MAX_DURATION on bad input.
 *
 * @param {unknown} value
 * @param {'min'|'max'} kind
 * @returns {number|null}
 */
export function parseDurationMonths(value, kind = 'min') {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(n) || n < MIN_DURATION_MONTHS || n > MAX_DURATION_MONTHS) {
    const err = new Error(
      `${kind === 'max' ? 'max' : 'min'}_duration_months must be an integer between ${MIN_DURATION_MONTHS} and ${MAX_DURATION_MONTHS}`,
    );
    err.code = kind === 'max' ? 'INVALID_MAX_DURATION' : 'INVALID_MIN_DURATION';
    throw err;
  }
  return n;
}

/** @param {unknown} value */
export function parseMinDuration(value) {
  return parseDurationMonths(value, 'min');
}

/** @param {unknown} value */
export function parseMaxDuration(value) {
  return parseDurationMonths(value, 'max');
}

/**
 * Validate the min/max pair after each has been parsed.
 * @returns {{ error: string } | null}
 */
export function validateDurationPair(minMonths, maxMonths) {
  if (minMonths != null && maxMonths != null && maxMonths < minMonths) {
    return { error: 'max_duration_months must be greater than or equal to min_duration_months' };
  }
  return null;
}
