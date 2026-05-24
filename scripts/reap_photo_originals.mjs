#!/usr/bin/env node
/**
 * One-off cleanup: delete orphan original photo files from the
 * `listing-photos` bucket after backfill_photo_variants.mjs has rewritten
 * every listings.photos[] entry to point at the __card variant.
 *
 * Issue #128. Follows PR #125 (the backfill). The backfill intentionally
 * left originals in place so the operation was reversible; this script is
 * the cleanup half once the new variants have been live and stable.
 *
 * Snapshot at time of writing: 813 variant files (271 originals × 3
 * sizes — thumb/card/full), 286 suffix-less originals to reap. Some
 * originals predate the backfill (photo removed from listings.photos[]
 * but file never deleted from Storage); the script handles them
 * uniformly.
 *
 * Usage:
 *   # Dry run — prints what would be deleted, mutates nothing.
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/reap_photo_originals.mjs
 *
 *   # Apply.
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/reap_photo_originals.mjs --apply
 *
 *   # Restrict to one listing folder for a smoke test.
 *   ... --apply --listing 0100001
 *
 * Safety:
 *   - Dry-run is the default. --apply is required for any side effect.
 *   - Targets only files whose name does NOT match the variant suffix
 *     pattern __(thumb|card|full).(webp|jpe?g). Anything that looks like
 *     a live variant is left alone.
 *   - Before deleting, cross-references every candidate path against
 *     listings.photos[] in Postgres. If ANY listing still references a
 *     candidate's public URL, the script aborts without deleting (the
 *     backfill is incomplete; refuse to break a live listing).
 *   - Delete calls go through supabase.storage.remove(), which is
 *     idempotent — removing a missing file is a no-op.
 */

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'listing-photos';
// Mirrors VARIANT_RE in src/lib/photoVariants.js and the backfill script.
const VARIANT_RE = /__(thumb|card|full)\.(webp|jpe?g)$/i;
// Storage list pagination — Supabase's default cap per page is 100.
const PAGE_LIMIT = 100;
// supabase.storage.remove() can take many paths but keep batches modest
// to bound any single failure's blast radius.
const DELETE_BATCH = 50;

function parseArgs(argv) {
  const args = { apply: false, listing: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--listing') args.listing = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(
        'Usage: node scripts/reap_photo_originals.mjs [--apply] [--listing <folder>]'
      );
      process.exit(0);
    } else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return args;
}

function env(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env var: ${name}`);
    process.exit(2);
  }
  return v;
}

async function listFolder(supabase, folder) {
  // .list() returns one page at a time; loop until exhausted.
  const out = [];
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(folder, { limit: PAGE_LIMIT, offset });
    if (error) throw new Error(`list ${folder}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      // Storage's list returns both files and "folders" (prefixes). Real
      // files have a non-null id; prefixes come back with id === null.
      if (entry.id == null) continue;
      out.push(`${folder}/${entry.name}`);
    }
    if (data.length < PAGE_LIMIT) break;
  }
  return out;
}

async function listAllOriginals(supabase, restrictFolder) {
  // Top-level .list('') gives folders (and any root-level files).
  const folders = [];
  if (restrictFolder) {
    folders.push(restrictFolder);
  } else {
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list('', { limit: PAGE_LIMIT, offset });
      if (error) throw new Error(`list root: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const entry of data) {
        if (entry.id == null) folders.push(entry.name);
      }
      if (data.length < PAGE_LIMIT) break;
    }
  }

  const originals = [];
  for (const folder of folders) {
    const paths = await listFolder(supabase, folder);
    for (const p of paths) {
      if (!VARIANT_RE.test(p)) originals.push(p);
    }
  }
  return originals;
}

async function fetchReferencedUrls(supabase) {
  // Build the set of all URLs currently referenced by listings.photos[].
  // Used to abort if a candidate is still live.
  const { data, error } = await supabase.from('listings').select('photos');
  if (error) throw new Error(`select listings.photos: ${error.message}`);
  const set = new Set();
  for (const row of data || []) {
    const photos = Array.isArray(row.photos) ? row.photos : [];
    for (const p of photos) set.add(p);
  }
  return set;
}

async function main() {
  const args = parseArgs(process.argv);
  const SUPABASE_URL = env('SUPABASE_URL');
  const SUPABASE_KEY = env('SUPABASE_SERVICE_KEY');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const publicUrlPrefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  const mode = args.apply ? 'APPLY' : 'DRY RUN';
  console.log(
    `[${mode}] reap photo originals${args.listing ? ` for folder ${args.listing}` : ''}`
  );
  console.log('');

  console.log('enumerating storage…');
  const originals = await listAllOriginals(supabase, args.listing);
  console.log(`  found ${originals.length} suffix-less file(s)`);

  if (originals.length === 0) {
    console.log('nothing to do.');
    return;
  }

  console.log('cross-referencing listings.photos[]…');
  const referenced = await fetchReferencedUrls(supabase);
  const stillLive = [];
  for (const path of originals) {
    if (referenced.has(publicUrlPrefix + path)) stillLive.push(path);
  }
  if (stillLive.length > 0) {
    console.error('');
    console.error(
      `ABORT: ${stillLive.length} candidate(s) still referenced by listings.photos[]:`
    );
    for (const p of stillLive.slice(0, 10)) console.error(`  ${p}`);
    if (stillLive.length > 10) console.error(`  …and ${stillLive.length - 10} more`);
    console.error('');
    console.error(
      'Backfill is incomplete. Run backfill_photo_variants.mjs --apply first.'
    );
    process.exit(1);
  }
  console.log('  0 still referenced — safe to proceed.');
  console.log('');

  let deleted = 0;
  let missing = 0;
  let failed = 0;

  for (let i = 0; i < originals.length; i += DELETE_BATCH) {
    const batch = originals.slice(i, i + DELETE_BATCH);
    if (!args.apply) {
      for (const p of batch) console.log(`  would delete: ${p}`);
      continue;
    }
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`  batch ${i}-${i + batch.length}: ${error.message}`);
      failed += batch.length;
      continue;
    }
    // .remove() returns the entries it actually removed. Anything in
    // `batch` not present in `data` was already gone — idempotent skip.
    const removedSet = new Set((data || []).map((e) => e.name));
    for (const p of batch) {
      if (removedSet.has(p)) {
        deleted += 1;
        console.log(`  deleted: ${p}`);
      } else {
        missing += 1;
        console.log(`  skipped (already gone): ${p}`);
      }
    }
  }

  console.log('');
  console.log('summary:');
  console.log(`  mode:                     ${mode}`);
  console.log(`  candidates:               ${originals.length}`);
  if (args.apply) {
    console.log(`  deleted:                  ${deleted}`);
    console.log(`  skipped (already gone):   ${missing}`);
    console.log(`  failed:                   ${failed}`);
  } else {
    console.log(`  would delete:             ${originals.length}`);
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
