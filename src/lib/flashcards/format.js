/** Display helpers for flashcards-deck content (presentation only). */

/**
 * Bytes to a short human-readable size, e.g. 701491 -> "685 KB".
 * @param {number} bytes
 * @returns {string}
 */
export function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * ISO date to a short display date, e.g. "2026-07-03" -> "Jul 3, 2026".
 * Fixed locale (not the visitor's) so server-rendered output is deterministic.
 * @param {string} iso
 * @returns {string}
 */
export function humanDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
