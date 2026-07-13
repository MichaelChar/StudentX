#!/usr/bin/env node
/**
 * Generate src/lib/resources/manifest.generated.js — a flat array of
 * /resources hub cards, one per practice test and one per flashcard deck.
 *
 * WHY THIS EXISTS — Cloudflare Workers (OpenNext) has no runtime `fs`, so this
 * data can't be read from content/*.json at request time. Unlike
 * scripts/generate-practice-manifest.mjs (which imports full test JSON so the
 * player can run), the /resources cards only need index.json metadata, so we
 * resolve everything here at generation time and emit a plain JS array
 * literal — no imports needed, still zero runtime fs.
 *
 * Fails loudly (non-zero exit) if a facet value isn't in
 * src/lib/resources/taxonomy.js or a required field is missing, mirroring
 * scripts/validate-tests.mjs / scripts/validate-flashcards.mjs (PR #311).
 *
 *   npm run resources:manifest
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SubjectIndexSchema as PracticeSubjectIndexSchema } from '../src/lib/practice/schema.js';
import { SubjectIndexSchema as FlashcardsSubjectIndexSchema } from '../src/lib/flashcards/schema.js';
import { ResourceEntrySchema } from '../src/lib/resources/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Walk every semester under the AUSoM tree: content/practice/ausom/<semester-N>/<subject>/.
const PRACTICE_ROOT = path.join(ROOT, 'content/practice/ausom');
const FLASHCARDS_ROOT = path.join(ROOT, 'content/flashcards');
const OUT_FILE = path.join(ROOT, 'src/lib/resources/manifest.generated.js');

/** @type {string[]} */
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

function subjectDirs(root) {
  return existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
}

function readIndex(dir, subject) {
  const indexPath = path.join(dir, 'index.json');
  if (!existsSync(indexPath)) return null;
  return JSON.parse(readFileSync(indexPath, 'utf8'));
}

/** Directory names that look like a semester slug ("semester-2"), sorted. */
function semesterDirs(root) {
  return existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^semester-\d+$/.test(d.name))
        .map((d) => d.name)
        .sort()
    : [];
}

function collectPracticeEntries() {
  const entries = [];
  for (const semester of semesterDirs(PRACTICE_ROOT)) {
    const semesterDir = path.join(PRACTICE_ROOT, semester);
    for (const subject of subjectDirs(semesterDir)) {
      const dir = path.join(semesterDir, subject);
      const raw = readIndex(dir, subject);
      const rel = `content/practice/ausom/${semester}/${subject}/index.json`;
      if (!raw) {
        err(rel, 'missing index.json');
        continue;
      }
      const parsed = PracticeSubjectIndexSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) err(rel, `${issue.message} (at ${issue.path.join('.')})`);
        continue;
      }
      const index = parsed.data;
      if (index.semester !== semester) {
        err(rel, `semester "${index.semester}" does not match folder "${semester}"`);
        continue;
      }
      for (const test of index.tests) {
        // Subject slug (facet/filter value + ?subject=) comes from index.json,
        // falling back to the folder name. Slugs are exact (no family merging).
        const subjectSlug = index.subject || subject;
        entries.push({
          // The card type defaults to 'practice-test'; a test can opt into
          // 'past-paper' via `resourceType` in its index.json entry.
          id: `practice:${subject}:${test.id}`,
          type: test.resourceType || 'practice-test',
          title: test.title,
          description: test.description,
          href: `/student/ausom/${semester}/${subject}/${test.id}`,
          school: index.school,
          subject: subjectSlug,
          semester: index.semester,
          country: index.country,
          year: test.year,
          meta: { questionCount: test.questionCount },
        });
      }
    }
  }
  return entries;
}

function collectFlashcardEntries() {
  const entries = [];
  for (const subject of subjectDirs(FLASHCARDS_ROOT)) {
    const dir = path.join(FLASHCARDS_ROOT, subject);
    const raw = readIndex(dir, subject);
    const rel = `content/flashcards/${subject}/index.json`;
    if (!raw) {
      err(rel, 'missing index.json');
      continue;
    }
    const parsed = FlashcardsSubjectIndexSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) err(rel, `${issue.message} (at ${issue.path.join('.')})`);
      continue;
    }
    const index = parsed.data;
    for (const deck of index.decks) {
      // Subject slug (facet/filter value + ?subject=) comes from index.json,
      // falling back to the folder name. Slugs are exact (no family merging).
      const subjectSlug = index.subject || subject;
      entries.push({
        id: `flashcard:${subject}:${deck.id}`,
        type: 'flashcard-deck',
        title: deck.title,
        description: deck.description,
        // Decks download directly (the .apkg file), unlike practice tests
        // which navigate to a page — see ResourceCard in ResourcesExplorer.js.
        href: deck.file,
        school: index.school,
        subject: subjectSlug,
        semester: index.semester,
        country: index.country,
        year: deck.year,
        meta: { cardCount: deck.cardCount },
      });
    }
  }
  return entries;
}

// Hand-authored entries for resources that live outside the content/ trees.
// The Medical Informatics exam is a standalone static HTML page under public/
// (no per-question JSON), so it can't go through the practice pipeline — it
// would break scripts/generate-practice-manifest.mjs, which imports a JSON
// file per test. Validated against ResourceEntrySchema like everything else.
const EXTRA_RESOURCES = [
  {
    id: 'practice:medical-informatics:predicted-practice-exam',
    type: 'practice-test',
    title: 'Medical Informatics — Predicted Practice Exam',
    description:
      'Standalone practice exam predicting the contents of the Medical Informatics June 2026 exam.',
    href: '/practice/ausom/semester-2/medical-informatics/predicted-practice-exam.html',
    school: 'ausom',
    subject: 'medical-informatics',
    semester: 'semester-2',
    country: 'gr',
    year: 2026,
  },
];

function main() {
  const entries = [...collectPracticeEntries(), ...collectFlashcardEntries(), ...EXTRA_RESOURCES];

  for (const entry of entries) {
    const parsed = ResourceEntrySchema.safeParse(entry);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) err(entry.id, `${issue.message} (at ${issue.path.join('.')})`);
    }
  }

  if (errors.length) {
    console.error(`\n✗ Resources manifest generation failed — ${errors.length} error(s):\n`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error('');
    process.exit(1);
  }

  // Deterministic order regardless of filesystem readdir ordering.
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const body = `// @generated by scripts/generate-resources-manifest.mjs — DO NOT EDIT BY HAND.
// Run \`npm run resources:manifest\` to regenerate after changing
// content/practice/ or content/flashcards/.
//
// Fully resolved at generation time (no imports needed) — every field is
// already validated against src/lib/resources/schema.js, so this file is a
// plain data literal with zero runtime fs (required for Cloudflare Workers /
// OpenNext).

/** @type {import('./schema.js').ResourceEntry[]} */
export const RESOURCES = ${JSON.stringify(entries, null, 2)};
`;

  writeFileSync(OUT_FILE, body);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} — ${entries.length} resource(s).`);
}

main();
