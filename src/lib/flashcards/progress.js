/**
 * Downloaded-state persistence for flashcard decks, mirroring the guarded
 * localStorage pattern in src/lib/practice/progress.js: every access is
 * try/catch-wrapped and degrades silently (private mode, quota-exceeded, and
 * SSR all resolve to "not downloaded" reads / no-op writes).
 *
 * Storage key: sx:flashcards:v1:{subject}:{deckId}:downloaded
 */

const NS = 'sx:flashcards:v1';

function downloadedKey(subject, deckId) {
  return `${NS}:${subject}:${deckId}:downloaded`;
}

/**
 * @param {string} subject
 * @param {string} deckId
 * @returns {boolean}
 */
export function isDownloaded(subject, deckId) {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(downloadedKey(subject, deckId)) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {string} subject
 * @param {string} deckId
 */
export function markDownloaded(subject, deckId) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(downloadedKey(subject, deckId), '1');
  } catch {
    // Private mode, quota exceeded, or SSR — degrade silently.
  }
}
