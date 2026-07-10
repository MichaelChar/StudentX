#!/usr/bin/env node
/**
 * Validate every study-notes content file under content/notes/.
 *
 * Runs in Node at CI/build time and uses fs freely. The zod schema in
 * src/lib/notes/schema.js is the canonical shape; this script adds the
 * cross-file / filesystem checks zod can't express (folder ↔ field agreement,
 * unique section ids). Mirrors scripts/validate-tests.mjs.
 *
 * Usage:   npm run validate:notes
 * Exit:    0 = all good, 1 = one or more errors (printed as a human list).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { NotesDocSchema } from '../src/lib/notes/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Walk every semester under the AUSoM tree: content/notes/ausom/<semester-N>/<subject>.json.
const CONTENT_ROOT = path.join(ROOT, 'content/notes/ausom');

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

function validateDoc(semester, file) {
  const rel = path.join('content/notes/ausom', semester, file);
  const subject = file.replace(/\.json$/, '');

  const read = readJson(path.join(CONTENT_ROOT, semester, file));
  if (read.error) {
    err(rel, `invalid JSON — ${read.error}`);
    return;
  }

  const parsed = NotesDocSchema.safeParse(read.data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const at = issue.path.length ? ` (at ${issue.path.join('.')})` : '';
      err(rel, `${issue.message}${at}`);
    }
    return;
  }
  const doc = parsed.data;

  if (doc.subject !== subject) {
    err(rel, `subject "${doc.subject}" does not match filename "${subject}.json"`);
  }
  if (doc.semester !== semester) {
    err(rel, `semester "${doc.semester}" does not match folder "${semester}"`);
  }

  const seen = new Set();
  for (const section of doc.sections) {
    if (seen.has(section.id)) err(rel, `duplicate section id "${section.id}"`);
    seen.add(section.id);
  }
}

function main() {
  if (!existsSync(CONTENT_ROOT)) {
    console.log(`✓ Notes validation passed — 0 doc(s) checked (no content directory).`);
    process.exit(0);
  }

  const semesters = readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^semester-\d+$/.test(d.name))
    .map((d) => d.name)
    .sort();

  let docCount = 0;
  for (const semester of semesters) {
    const files = readdirSync(path.join(CONTENT_ROOT, semester))
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const file of files) {
      validateDoc(semester, file);
      docCount += 1;
    }
  }

  if (errors.length) {
    console.error(`\n✗ Notes validation failed — ${errors.length} error(s):\n`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error('');
    process.exit(1);
  }

  console.log(`✓ Notes validation passed — ${docCount} doc(s) checked.`);
}

main();
