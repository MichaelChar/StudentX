/**
 * Server-side loaders for practice-test content.
 *
 * JSON-loading approach: a GENERATED MANIFEST of static imports
 * (src/lib/practice/manifest.generated.js, produced by
 * scripts/generate-practice-manifest.mjs). The bundler inlines every content
 * JSON file into the Worker bundle, so these loaders are pure synchronous
 * lookups with NO runtime `fs` — the requirement for Cloudflare Workers
 * (OpenNext), which has no filesystem at request time.
 *
 * Why not build-time `fs` + force-static? That also avoids runtime fs, but it
 * still leaves `fs`/`node:fs` in the module graph (fragile under the Workers
 * bundler) and only works for statically-generated routes. The manifest is the
 * simplest approach that works everywhere — server components, route handlers,
 * static or dynamic — without touching fs at all.
 *
 * Regenerate the manifest after changing content/practice/:  npm run practice:manifest
 *
 * @typedef {import('./schema.js').SubjectIndex} SubjectIndex
 * @typedef {import('./schema.js').PracticeTest} PracticeTest
 */

import { MANIFEST } from './manifest.generated.js';

/**
 * Subject index, or null if the subject has no content.
 * @param {string} subject Subject slug, e.g. "anatomy-1".
 * @returns {SubjectIndex | null}
 */
export function getSubjectIndex(subject) {
  return MANIFEST[subject]?.index ?? null;
}

/**
 * A single test, or null if the subject or test is unknown.
 * @param {string} subject Subject slug.
 * @param {string} testId  Test id, e.g. "upper-limb".
 * @returns {PracticeTest | null}
 */
export function getTest(subject, testId) {
  return MANIFEST[subject]?.tests?.[testId] ?? null;
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
