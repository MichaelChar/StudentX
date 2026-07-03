#!/usr/bin/env node
/**
 * Validate every flashcards-subject index.json under content/flashcards/.
 *
 * Runs in Node at CI/build time and uses fs freely. The zod schema in
 * src/lib/flashcards/schema.js is the canonical shape; this script adds the
 * cross-file and filesystem checks zod can't express. Mirrors
 * scripts/validate-tests.mjs.
 *
 * Usage:   npm run validate:flashcards
 * Exit:    0 = all good, 1 = one or more errors (printed as a human list).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SubjectIndexSchema } from '../src/lib/flashcards/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content/flashcards');
const PUBLIC_ROOT = path.join(ROOT, 'public');

// Cloudflare's static-asset per-file hard limit.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Allowed drift between a deck's declared fileSizeBytes and the file on disk
// (catches a stale manifest without demanding byte-exact bookkeeping).
const SIZE_DRIFT_BYTES = 1024;

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

function zodIssues(rel, result) {
  for (const issue of result.error.issues) {
    const at = issue.path.length ? ` (at ${issue.path.join('.')})` : '';
    err(rel, `${issue.message}${at}`);
  }
}

const seenDeckIds = new Set();

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

  const parsed = SubjectIndexSchema.safeParse(indexRead.data);
  if (!parsed.success) {
    zodIssues(indexRel, parsed);
    return;
  }
  const index = parsed.data;

  if (index.subject !== subject) {
    err(indexRel, `subject "${index.subject}" does not match folder "${subject}"`);
  }

  for (const deck of index.decks) {
    if (seenDeckIds.has(deck.id)) {
      err(indexRel, `duplicate deck id "${deck.id}" across subjects`);
    }
    seenDeckIds.add(deck.id);

    if (!deck.file.startsWith('/flashcards/')) {
      err(indexRel, `deck "${deck.id}": file "${deck.file}" must be under /flashcards/`);
      continue;
    }

    const filePath = path.join(PUBLIC_ROOT, deck.file.replace(/^\//, ''));
    if (!existsSync(filePath)) {
      err(indexRel, `deck "${deck.id}": file "${deck.file}" not found under public/`);
      continue;
    }

    const { size } = statSync(filePath);
    if (size > MAX_FILE_BYTES) {
      err(indexRel, `deck "${deck.id}": file is ${size} bytes, exceeds the ${MAX_FILE_BYTES}-byte static-asset limit`);
    }
    if (Math.abs(size - deck.fileSizeBytes) > SIZE_DRIFT_BYTES) {
      err(
        indexRel,
        `deck "${deck.id}": declared fileSizeBytes ${deck.fileSizeBytes} does not match actual file size ${size}`,
      );
    }
  }
}

function main() {
  if (!existsSync(CONTENT_ROOT)) {
    console.log(`✓ Flashcards validation passed — 0 subject(s) checked (no content directory).`);
    process.exit(0);
  }

  const subjects = readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const subject of subjects) validateSubject(subject);

  if (errors.length) {
    console.error(`\n✗ Flashcards validation failed — ${errors.length} error(s):\n`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error('');
    process.exit(1);
  }

  console.log(`✓ Flashcards validation passed — ${subjects.length} subject(s) checked.`);
}

main();
