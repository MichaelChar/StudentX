/**
 * Server-side loaders for Anki flashcard-deck content.
 *
 * JSON-loading approach: a GENERATED MANIFEST of static imports
 * (src/lib/flashcards/manifest.generated.js, produced by
 * scripts/generate-flashcards-manifest.mjs). The bundler inlines every content
 * JSON file into the Worker bundle, so these loaders are pure synchronous
 * lookups with NO runtime `fs` — the requirement for Cloudflare Workers
 * (OpenNext), which has no filesystem at request time. Mirrors
 * src/lib/practice/content.js.
 *
 * Regenerate the manifest after changing content/flashcards/:  npm run flashcards:manifest
 *
 * @typedef {import('./schema.js').SubjectIndex} SubjectIndex
 */

import { MANIFEST } from './manifest.generated.js';

/**
 * Subject index, or null if the subject has no content.
 * @param {string} subject Subject slug, e.g. "histology".
 * @returns {SubjectIndex | null}
 */
export function getSubjectIndex(subject) {
  return MANIFEST[subject]?.index ?? null;
}

/**
 * Slugs of every subject that has an index.json, sorted.
 * @returns {string[]}
 */
export function listSubjectsWithContent() {
  return Object.keys(MANIFEST)
    .filter((subject) => Boolean(MANIFEST[subject]?.index))
    .sort();
}
