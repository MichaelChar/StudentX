/**
 * Server-side text normalizers for free-form input fields.
 *
 * Two flavors:
 *   - normalizeSingleLine: collapse all whitespace (incl. newlines) to one
 *     space, strip Unicode control characters. For names, addresses,
 *     headings, single-row identifiers.
 *   - normalizeMultiLine: preserve paragraph structure (newlines), strip
 *     non-newline control chars, collapse horizontal whitespace per line,
 *     trim each line, and cap consecutive blank lines at one (so paragraph
 *     breaks survive but ASCII art / spam-padding doesn't). For descriptions,
 *     chat messages, anywhere a user might write paragraphs.
 *
 * Both return null when the result is empty after normalization (lets
 * callers decide whether null means "missing field" or "intentional clear").
 *
 * Both are server-side: never trust client-side normalization, since clients
 * can bypass the form. The lookalike client-side normalization (e.g.
 * src/components/ListingForm.js codepoint counter) is only for ergonomics.
 */

/** Codepoint-aware length. Matches Postgres `char_length()`. */
export function codepointLength(str) {
  return [...str].length;
}

/**
 * Collapse a free-form value into a single trimmed line, with all Unicode
 * control characters (incl. \r \n \t and DEL) replaced by a space, and
 * runs of whitespace collapsed to one.
 *
 * @param {unknown} value
 * @returns {string|null} normalized string, or null if input was null/
 *   undefined or normalized to an empty string.
 */
export function normalizeSingleLine(value) {
  if (value === null || value === undefined) return null;
  const str = String(value)
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return str.length === 0 ? null : str;
}

/**
 * Normalize a multi-line value while preserving paragraph structure:
 *  - CRLF/CR normalized to LF
 *  - On each line: control chars stripped to space, runs of horizontal
 *    whitespace collapsed, line trimmed
 *  - Three or more consecutive newlines collapsed to two (one blank line
 *    between paragraphs is plenty)
 *  - Outer trim
 *
 * @param {unknown} value
 * @returns {string|null} normalized string, or null if input was null/
 *   undefined or normalized to an empty string.
 */
export function normalizeMultiLine(value) {
  if (value === null || value === undefined) return null;
  const str = String(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        // \n is already removed (we split on it); \p{Cc} strips the rest
        // including \t, which collapses below.
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return str.length === 0 ? null : str;
}
