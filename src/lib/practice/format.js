/** Display helpers for practice-test content (presentation only). */

/**
 * Turn a topic slug into a readable label: "upper-limb" → "Upper limb".
 * Pure cosmetic — the slug itself stays the source of truth in the JSON.
 * @param {string} slug
 * @returns {string}
 */
export function prettifyTopic(slug) {
  if (!slug) return '';
  const spaced = slug.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
