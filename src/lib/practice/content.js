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
 * @param {string} semester Semester slug, e.g. "semester-2".
 * @param {string} subject  Subject slug, e.g. "anatomy-1".
 * @returns {SubjectIndex | null}
 */
export function getSubjectIndex(semester, subject) {
  return MANIFEST[semester]?.[subject]?.index ?? null;
}

/**
 * A single test, or null if the semester, subject or test is unknown.
 * @param {string} semester Semester slug.
 * @param {string} subject  Subject slug.
 * @param {string} testId   Test id, e.g. "upper-limb".
 * @returns {PracticeTest | null}
 */
export function getTest(semester, subject, testId) {
  return MANIFEST[semester]?.[subject]?.tests?.[testId] ?? null;
}

/**
 * Every published {semester, subject} pair (i.e. that has an index.json),
 * sorted by semester then subject.
 * @returns {{ semester: string, subject: string }[]}
 */
export function listSubjectsWithContent() {
  const pairs = [];
  for (const semester of Object.keys(MANIFEST)) {
    for (const subject of Object.keys(MANIFEST[semester] ?? {})) {
      if (MANIFEST[semester][subject]?.index) pairs.push({ semester, subject });
    }
  }
  return pairs.sort(
    (a, b) => a.semester.localeCompare(b.semester) || a.subject.localeCompare(b.subject),
  );
}

/**
 * Slugs of every semester that has at least one published subject, sorted.
 * Drives generateStaticParams at the [semester] level.
 * @returns {string[]}
 */
export function listSemestersWithContent() {
  return Object.keys(MANIFEST)
    .filter((semester) => Object.values(MANIFEST[semester] ?? {}).some((s) => s?.index))
    .sort();
}

/**
 * First subject index matching a slug across any semester. Subject slugs are
 * effectively unique across the corpus, so this is a convenient label lookup
 * for surfaces (e.g. /admin/practice-reports) that key by subject alone.
 * @param {string} subject Subject slug.
 * @returns {SubjectIndex | null}
 */
export function findSubjectIndexBySubject(subject) {
  for (const semester of Object.keys(MANIFEST)) {
    const index = MANIFEST[semester]?.[subject]?.index;
    if (index) return index;
  }
  return null;
}
