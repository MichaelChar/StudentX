/**
 * Helpers for the landlord-chosen public listing name.
 *
 * The field is required (NOT NULL in the schema after migration 038),
 * capped at 80 codepoints, and stored already-normalized via the
 * single-line normalizer in src/lib/textNormalize.js.
 *
 * Both the POST and PATCH routes for /api/landlord/listings use this
 * helper so the column never holds raw user input.
 *
 * Note: variable + constant names still use "title" because the DB
 * column, API field, and React state are all `title`. Only the user-
 * visible label was renamed to "Name your listing" — see the
 * landlord.listingForm.titleLabel key in src/messages/{el,en}.json.
 */

import { normalizeSingleLine, codepointLength } from './textNormalize';

export { codepointLength };

export const TITLE_MAX_LENGTH = 80;

/**
 * @param {unknown} value - Raw value from the request body.
 * @returns {string|null} Normalized value, or null when input is null/
 *   undefined / empty after normalization. Callers decide what null
 *   means: POST rejects, PATCH treats as "explicit clear" → 400.
 * @throws {Error & { code: 'TITLE_TOO_LONG' }} when the normalized
 *   length exceeds TITLE_MAX_LENGTH codepoints.
 */
export function normalizeTitle(value) {
  const str = normalizeSingleLine(value);
  if (str === null) return null;

  if (codepointLength(str) > TITLE_MAX_LENGTH) {
    const err = new Error(
      `title must be ${TITLE_MAX_LENGTH} characters or fewer`
    );
    err.code = 'TITLE_TOO_LONG';
    throw err;
  }

  return str;
}
