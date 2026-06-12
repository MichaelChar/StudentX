#!/usr/bin/env node
/**
 * Validate every practice-test content file under content/practice/.
 *
 * Implements PLAN.md §2.4. Runs in Node at CI/build time and uses fs freely.
 * The zod schemas in src/lib/practice/schema.js are the canonical shape; this
 * script adds the cross-file and filesystem checks zod can't express.
 *
 * Usage:   npm run validate:tests
 * Exit:    0 = all good, 1 = one or more errors (printed as a human list).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SubjectIndexSchema,
  PracticeTestSchema,
} from '../src/lib/practice/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content/practice/ausom/semester-2');
const PUBLIC_ROOT = path.join(ROOT, 'public');

/** @type {string[]} */
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

function readJson(file) {
  try {
    return { data: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: e.message };
  }
}

/** Format zod issues as readable lines. */
function zodIssues(rel, result) {
  for (const issue of result.error.issues) {
    const at = issue.path.length ? ` (at ${issue.path.join('.')})` : '';
    err(rel, `${issue.message}${at}`);
  }
}

function validateTest(rel, test, expectedSubject) {
  const parsed = PracticeTestSchema.safeParse(test);
  if (!parsed.success) {
    zodIssues(rel, parsed);
    return null;
  }
  const t = parsed.data;

  if (t.subject !== expectedSubject) {
    err(rel, `subject "${t.subject}" does not match its folder "${expectedSubject}"`);
  }

  // unique question ids within the test
  const seen = new Set();
  for (const q of t.questions) {
    if (seen.has(q.id)) err(rel, `duplicate question id "${q.id}"`);
    seen.add(q.id);

    // option-count rules per type
    if (q.type === 'mcq' && (q.options.length < 4 || q.options.length > 5)) {
      err(rel, `question "${q.id}": mcq must have 4–5 options, has ${q.options.length}`);
    }
    if (q.type === 'tf') {
      const ok = q.options.length === 2 && q.options[0] === 'True' && q.options[1] === 'False';
      if (!ok) err(rel, `question "${q.id}": tf options must be exactly ["True","False"]`);
    }

    // correct index in range (also enforced by schema; kept as a clear message)
    if (q.correct < 0 || q.correct >= q.options.length) {
      err(rel, `question "${q.id}": correct index ${q.correct} out of range for ${q.options.length} options`);
    }

    // explanation image path must exist under public/
    if (q.explanation.image) {
      const imgPath = path.join(PUBLIC_ROOT, q.explanation.image.replace(/^\//, ''));
      if (!existsSync(imgPath)) {
        err(rel, `question "${q.id}": image "${q.explanation.image}" not found under public/`);
      }
    }

    // mock <=> pastPaperRef
    if (t.kind === 'mock' && !q.pastPaperRef) {
      err(rel, `question "${q.id}": mock test requires a pastPaperRef`);
    }
    if (t.kind === 'topic' && q.pastPaperRef) {
      err(rel, `question "${q.id}": topic test must not have a pastPaperRef`);
    }
  }

  return t;
}

function validateSubject(subject) {
  const dir = path.join(CONTENT_ROOT, subject);
  const indexRel = path.join(subject, 'index.json');
  const indexPath = path.join(dir, 'index.json');

  if (!existsSync(indexPath)) {
    err(subject, 'missing index.json');
    return;
  }

  const indexRead = readJson(indexPath);
  if (indexRead.error) {
    err(indexRel, `invalid JSON — ${indexRead.error}`);
    return;
  }

  const indexParsed = SubjectIndexSchema.safeParse(indexRead.data);
  if (!indexParsed.success) {
    zodIssues(indexRel, indexParsed);
    return;
  }
  const index = indexParsed.data;

  if (index.subject !== subject) {
    err(indexRel, `subject "${index.subject}" does not match folder "${subject}"`);
  }

  // load every test file in the folder
  const testFiles = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();

  /** @type {Map<string, import('../src/lib/practice/schema.js').PracticeTest>} */
  const loaded = new Map();
  const testIds = new Set();

  for (const file of testFiles) {
    const rel = path.join(subject, file);
    const read = readJson(path.join(dir, file));
    if (read.error) {
      err(rel, `invalid JSON — ${read.error}`);
      continue;
    }
    const t = validateTest(rel, read.data, subject);
    if (!t) continue;

    const expectedId = file.replace(/\.json$/, '');
    if (t.id !== expectedId) {
      err(rel, `test id "${t.id}" does not match filename "${expectedId}.json"`);
    }
    if (testIds.has(t.id)) err(rel, `duplicate test id "${t.id}" within subject`);
    testIds.add(t.id);
    loaded.set(t.id, t);
  }

  // index.json must agree with the test files: ids, titles, kinds, counts
  const indexIds = new Set();
  for (const entry of index.tests) {
    if (indexIds.has(entry.id)) err(indexRel, `duplicate test id "${entry.id}" in index`);
    indexIds.add(entry.id);

    const t = loaded.get(entry.id);
    if (!t) {
      err(indexRel, `index lists test "${entry.id}" but ${entry.id}.json is missing or invalid`);
      continue;
    }
    if (entry.title !== t.title) {
      err(indexRel, `test "${entry.id}": index title "${entry.title}" != file title "${t.title}"`);
    }
    if (entry.kind !== t.kind) {
      err(indexRel, `test "${entry.id}": index kind "${entry.kind}" != file kind "${t.kind}"`);
    }
    if (entry.questionCount !== t.questions.length) {
      err(indexRel, `test "${entry.id}": index questionCount ${entry.questionCount} != ${t.questions.length} questions`);
    }
  }

  // every test file must be listed in the index
  for (const id of loaded.keys()) {
    if (!indexIds.has(id)) err(indexRel, `test file "${id}.json" is not listed in index.json`);
  }
}

function main() {
  if (!existsSync(CONTENT_ROOT)) {
    console.error(`No content directory at ${path.relative(ROOT, CONTENT_ROOT)}`);
    process.exit(1);
  }

  const subjects = readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const subject of subjects) validateSubject(subject);

  if (errors.length) {
    console.error(`\n✗ Practice-test validation failed — ${errors.length} error(s):\n`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error('');
    process.exit(1);
  }

  console.log(`✓ Practice-test validation passed — ${subjects.length} subject(s) checked.`);
}

main();
