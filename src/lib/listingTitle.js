/**
 * Shared helpers for the landlord-chosen public listing title.
 *
 * The title is required (NOT NULL in the schema after migration 038),
 * capped at 80 chars, and stored already-normalized:
 *  - control characters and newlines collapsed to single spaces
 *  - runs of whitespace collapsed to one space
 *  - trimmed
 *
 * Both the POST and PATCH routes for /api/landlord/listings use this
 * normalizer so the column never holds raw user input.
 */

export const TITLE_MAX_LENGTH = 80;

/**
 * Codepoint-aware string length. Matches Postgres `char_length()` (used by
 * the column CHECK in migration 038) instead of the default `str.length`,
 * which counts UTF-16 code units and double-counts astral-plane characters
 * (emoji etc.). Imported by both server and client so the cap stays in
 * lockstep across the form's live counter, the form's input gate, the
 * server normalizer, and the DB constraint.
 */
export function codepointLength(str) {
  return [...str].length;
}

/**
 * Normalizes a title value for storage.
 * @param {unknown} value - Raw value from the request body.
 * @returns {string|null} The normalized title, or null when the input
 *   is null/undefined/empty-after-normalization. Callers decide
 *   whether null is acceptable (POST rejects, PATCH treats as
 *   "explicit clear" → 400 since title is required).
 * @throws {Error & { code: 'TITLE_TOO_LONG' }} When the normalized
 *   string exceeds TITLE_MAX_LENGTH characters.
 */
export function normalizeTitle(value) {
  if (value === null || value === undefined) return null;

  // Strip Unicode control characters (\p{Cc} — covers C0 controls
  // including \r \n \t, plus DEL and C1), then collapse runs of
  // whitespace, then trim.
  const str = String(value)
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (str.length === 0) return null;

  // Count codepoints, not UTF-16 code units. Postgres `char_length()` (used
  // by the column CHECK in migration 038) counts codepoints; `str.length`
  // double-counts astral-plane characters (emoji etc.) and would let a
  // string pass JS validation only to fail the DB CHECK.
  if (codepointLength(str) > TITLE_MAX_LENGTH) {
    const err = new Error(
      `title must be ${TITLE_MAX_LENGTH} characters or fewer`
    );
    err.code = 'TITLE_TOO_LONG';
    throw err;
  }

  return str;
}
