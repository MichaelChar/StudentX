/**
 * Progress persistence for practice tests.
 *
 * The UI talks only to the {@link ProgressStore} interface, never to
 * localStorage directly. That keeps the storage backend swappable: a future
 * Supabase-backed implementation can satisfy the same interface and replace
 * {@link LocalStorageProgressStore} via {@link getProgressStore} without
 * touching a single UI component.
 *
 * Two record shapes are persisted per test:
 *   - Attempt        — a completed run (score + per-question answers).
 *   - AttemptSnapshot — the serializable mid-test state TestPlayer saves after
 *                       every answer, so a refresh can resume in place.
 *
 * Storage keys are namespaced and versioned:
 *   sx:practice:v1:{subject}:{testId}:attempts  → Attempt[]
 *   sx:practice:v1:{subject}:{testId}:wip       → AttemptSnapshot
 *
 * Robustness: every localStorage access is wrapped in try/catch and corrupt or
 * missing data degrades to empty/null. Reads never throw and writes never throw
 * — private mode, quota-exceeded, and SSR (no `localStorage`) all degrade
 * silently. The store is safe to call from a client component's effect.
 */

/**
 * One answered question within an Attempt or AttemptSnapshot. Indices are
 * AUTHORED option indices (stable across option shuffles), not display indices.
 * @typedef {Object} AttemptAnswer
 * @property {string} questionId
 * @property {number|null} chosen  Authored index of the option the user chose.
 * @property {number} correct      Authored index of the correct option.
 */

/**
 * A completed run.
 * @typedef {Object} Attempt
 * @property {string} testId
 * @property {string} subject
 * @property {number} version     Test version this attempt was taken against.
 * @property {string} startedAt   ISO timestamp.
 * @property {string} finishedAt  ISO timestamp.
 * @property {number} score
 * @property {number} total
 * @property {AttemptAnswer[]} answers
 */

/**
 * Serializable mid-test state — enough to rebuild the exact same attempt.
 * @typedef {Object} AttemptSnapshot
 * @property {string} testId
 * @property {string} subject
 * @property {number} version       Test version; a mismatch on load is discarded.
 * @property {string[]} order       Shuffled question-id array (the attempt order).
 * @property {AttemptAnswer[]} answers  Partial — only questions answered so far.
 */

/**
 * Storage backend contract. Implementations must never throw.
 * @typedef {Object} ProgressStore
 * @property {(subject: string, testId: string) => Attempt[]} getAttempts
 * @property {(attempt: Attempt) => void} saveAttempt
 * @property {(subject: string, testId: string) => (AttemptSnapshot|null)} getInProgress
 * @property {(snapshot: AttemptSnapshot) => void} saveInProgress
 * @property {(subject: string, testId: string) => void} clearInProgress
 */

const NS = 'sx:practice:v1';

function attemptsKey(subject, testId) {
  return `${NS}:${subject}:${testId}:attempts`;
}

function wipKey(subject, testId) {
  return `${NS}:${subject}:${testId}:wip`;
}

// --- guarded localStorage access (never throws) ---------------------------

function readJSON(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    // Missing storage (SSR), private-mode read errors, or corrupt JSON.
    return null;
  }
}

function writeJSON(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode, quota exceeded, or SSR — degrade silently.
  }
}

function removeKey(key) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // Nothing actionable — degrade silently.
  }
}

/**
 * localStorage-backed {@link ProgressStore}.
 * @implements {ProgressStore}
 */
export class LocalStorageProgressStore {
  /**
   * @param {string} subject
   * @param {string} testId
   * @returns {Attempt[]} Oldest-first; empty array when absent or corrupt.
   */
  getAttempts(subject, testId) {
    const data = readJSON(attemptsKey(subject, testId));
    return Array.isArray(data) ? data : [];
  }

  /** @param {Attempt} attempt */
  saveAttempt(attempt) {
    if (!attempt || !attempt.subject || !attempt.testId) return;
    const existing = this.getAttempts(attempt.subject, attempt.testId);
    existing.push(attempt);
    writeJSON(attemptsKey(attempt.subject, attempt.testId), existing);
  }

  /**
   * @param {string} subject
   * @param {string} testId
   * @returns {AttemptSnapshot|null} null when absent or shape is invalid.
   */
  getInProgress(subject, testId) {
    const data = readJSON(wipKey(subject, testId));
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.order) || !Array.isArray(data.answers)) return null;
    return data;
  }

  /** @param {AttemptSnapshot} snapshot */
  saveInProgress(snapshot) {
    if (!snapshot || !snapshot.subject || !snapshot.testId) return;
    writeJSON(wipKey(snapshot.subject, snapshot.testId), snapshot);
  }

  /**
   * @param {string} subject
   * @param {string} testId
   */
  clearInProgress(subject, testId) {
    removeKey(wipKey(subject, testId));
  }
}

let instance = null;

/**
 * Returns the process-wide {@link ProgressStore}. Client-side only — call from
 * effects/handlers, not during render or on the server.
 * @returns {ProgressStore}
 */
export function getProgressStore() {
  if (!instance) instance = new LocalStorageProgressStore();
  return instance;
}
