/**
 * Server-side loaders for study-notes content.
 *
 * JSON-loading approach: a GENERATED MANIFEST of static imports
 * (src/lib/notes/manifest.generated.js, produced by
 * scripts/generate-notes-manifest.mjs). The bundler inlines every content JSON
 * file into the Worker bundle, so these loaders are pure synchronous lookups
 * with NO runtime `fs` — the requirement for Cloudflare Workers (OpenNext),
 * which has no filesystem at request time. Mirrors src/lib/practice/content.js.
 *
 * Regenerate the manifest after changing content/notes/:  npm run notes:manifest
 *
 * @typedef {import('./schema.js').NotesDoc} NotesDoc
 */

import { MANIFEST } from './manifest.generated.js';

/**
 * A single notes document, or null if the semester/subject is unknown.
 * @param {string} semester Semester slug, e.g. "semester-6".
 * @param {string} subject  Subject slug, e.g. "hygiene-epidemiology".
 * @returns {NotesDoc | null}
 */
export function getNotesDoc(semester, subject) {
  return MANIFEST[semester]?.[subject] ?? null;
}

/**
 * Every published {semester, subject} pair that has a notes doc, sorted by
 * semester then subject. Drives generateStaticParams for the notes route.
 * @returns {{ semester: string, subject: string }[]}
 */
export function listNotesWithContent() {
  const pairs = [];
  for (const semester of Object.keys(MANIFEST)) {
    for (const subject of Object.keys(MANIFEST[semester] ?? {})) {
      pairs.push({ semester, subject });
    }
  }
  return pairs.sort(
    (a, b) => a.semester.localeCompare(b.semester) || a.subject.localeCompare(b.subject),
  );
}
