#!/usr/bin/env node
/**
 * One-off backfill: generate thumb/card/full variants for every existing
 * listing photo that doesn't already have them, then rewrite
 * listings.photos[] to point at the card variant.
 *
 * Issue #107. PR #106 made new uploads generate 3 sized variants (thumb
 * 400 px / card 800 px / full 1600 px, WebP). The display layer derives
 * thumb/full from the stored card URL via variantUrl() in
 * src/lib/photoVariants.js. Existing photos uploaded before #106 don't
 * have variants — they fall through the variantUrl regex and display at
 * original size. This script closes that gap.
 *
 * Snapshot at time of writing (verified via SQL): 271 photos across 14
 * listings, all on Supabase Storage, none with variant suffixes.
 *
 * Usage:
 *   # Dry run — prints what would happen, mutates nothing.
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/backfill_photo_variants.mjs
 *
 *   # Apply.
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/backfill_photo_variants.mjs --apply
 *
 *   # Restrict to one listing for a smoke test.
 *   ... --apply --listing 0100001
 *
 * Idempotency: any URL that already matches `__(thumb|card|full).(webp|jpe?g)$`
 * (the runtime VARIANT_RE) is skipped. Re-running after a partial failure
 * picks up where it left off without re-uploading completed variants.
 *
 * Safety:
 *   - Dry-run is the default. --apply is required for any side effect.
 *   - All-or-nothing per listing: if any photo in a listing fails to
 *     resize/upload, the listings.photos[] update for that listing is
 *     skipped. Originals are untouched, so the listing keeps rendering.
 *   - Originals are NOT deleted. Reaping orphaned originals is a
 *     follow-up after a week of stable verification.
 *   - Before any DB write, writes rollback SQL to
 *     scripts/backfill_photo_variants.rollback.sql.
 *
 * Conventions to mirror exactly (see src/lib/photoVariants.js):
 *   - Suffix pattern:   __thumb.webp / __card.webp / __full.webp
 *   - Stem preserved:   <userId>/<random-id>  (only the suffix changes)
 *   - Stored value:     the CARD URL (display sites derive others)
 */

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BUCKET = 'listing-photos';
const SIZES = { thumb: 400, card: 800, full: 1600 };
const QUALITY = 82;
// Mirrors VARIANT_RE in src/lib/photoVariants.js — case-insensitive,
// matches both webp and jpe?g extensions.
const VARIANT_RE = /__(thumb|card|full)\.(webp|jpe?g)$/i;

function parseArgs(argv) {
  const args = { apply: false, listing: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--listing') args.listing = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(
        'Usage: node scripts/backfill_photo_variants.mjs [--apply] [--listing <id>]'
      );
      process.exit(0);
    } else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return args;
}

function env(name, optional = false) {
  const v = process.env[name];
  if (!v && !optional) {
    console.error(`missing env var: ${name}`);
    process.exit(2);
  }
  return v;
}

function isSupabaseStorageUrl(url, supabaseUrl) {
  if (typeof url !== 'string') return false;
  // The public storage URL prefix for this project.
  return url.startsWith(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/`);
}

function storagePathFromUrl(url, supabaseUrl) {
  const prefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  return url.slice(prefix.length);
}

function stemAndExt(storagePath) {
  const dot = storagePath.lastIndexOf('.');
  if (dot < 0) return { stem: storagePath, ext: '' };
  return { stem: storagePath.slice(0, dot), ext: storagePath.slice(dot + 1) };
}

async function downloadOriginal(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function resize(buf, longestEdge) {
  // sharp.resize with both width+height bounded keeps aspect ratio.
  // withoutEnlargement: don't upscale tiny sources. fit:'inside' bounds
  // the longest edge — equivalent to the runtime's longest-edge logic.
  return sharp(buf)
    .rotate() // honour EXIF orientation (phones store landscape sideways)
    .resize({
      width: longestEdge,
      height: longestEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY })
    .toBuffer();
}

async function processOne({ supabase, supabaseUrl, listingId, originalUrl, dryRun, log }) {
  // Idempotency guards.
  if (!isSupabaseStorageUrl(originalUrl, supabaseUrl)) {
    log(`  skip (non-Supabase): ${originalUrl}`);
    return { changed: false, newUrl: originalUrl };
  }
  if (VARIANT_RE.test(originalUrl)) {
    log(`  skip (already-variant): ${originalUrl}`);
    return { changed: false, newUrl: originalUrl };
  }

  const storagePath = storagePathFromUrl(originalUrl, supabaseUrl);
  const { stem } = stemAndExt(storagePath);

  log(`  process: ${storagePath}`);

  if (dryRun) {
    // Synthesise the would-be card URL so the dry-run output is a
    // faithful preview of the rewrite that would happen.
    const cardPath = `${stem}__card.webp`;
    const cardUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${cardPath}`;
    log(`    would write: ${stem}__{thumb,card,full}.webp`);
    log(`    would set photo url to: ${cardUrl}`);
    return { changed: true, newUrl: cardUrl };
  }

  const original = await downloadOriginal(originalUrl);

  // Resize all three in parallel — sharp is C++-bound and CPU-light.
  const [thumbBuf, cardBuf, fullBuf] = await Promise.all([
    resize(original, SIZES.thumb),
    resize(original, SIZES.card),
    resize(original, SIZES.full),
  ]);

  // Upload all three. upsert:false so a half-done re-run won't overwrite
  // a successful previous variant; pre-existing variants are tolerated
  // (Storage returns 409, which we swallow).
  async function uploadVariant(size, buf) {
    const variantPath = `${stem}__${size}.webp`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(variantPath, buf, { contentType: 'image/webp', upsert: false });
    if (error && !/already exists|409/i.test(error.message)) {
      throw new Error(`upload ${variantPath}: ${error.message}`);
    }
    return variantPath;
  }

  await Promise.all([
    uploadVariant('thumb', thumbBuf),
    uploadVariant('full', fullBuf),
  ]);
  const cardPath = await uploadVariant('card', cardBuf);

  const cardUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${cardPath}`;
  log(`    wrote: ${stem}__{thumb,card,full}.webp`);
  log(`    new card url: ${cardUrl}`);
  return { changed: true, newUrl: cardUrl };
}

async function main() {
  const args = parseArgs(process.argv);
  const SUPABASE_URL = env('SUPABASE_URL');
  const SUPABASE_KEY = env('SUPABASE_SERVICE_KEY');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const mode = args.apply ? 'APPLY' : 'DRY RUN';
  console.log(`[${mode}] backfill photo variants${args.listing ? ` for listing ${args.listing}` : ''}`);
  console.log('');

  let query = supabase.from('listings').select('listing_id, photos');
  if (args.listing) query = query.eq('listing_id', args.listing);
  const { data: listings, error: selErr } = await query;
  if (selErr) {
    console.error('SELECT failed:', selErr);
    process.exit(1);
  }

  const rollbackLines = [];
  let listingsUpdated = 0;
  let listingsSkippedDueToFailure = 0;
  let urlsTouched = 0;
  let urlsSkippedAlready = 0;

  for (const row of listings || []) {
    const photos = Array.isArray(row.photos) ? row.photos : [];
    if (photos.length === 0) continue;

    console.log(`listing ${row.listing_id} (${photos.length} photos):`);

    const newPhotos = [];
    let listingFailed = false;
    let listingChangedAny = false;

    for (const url of photos) {
      try {
        const { changed, newUrl } = await processOne({
          supabase,
          supabaseUrl: SUPABASE_URL,
          listingId: row.listing_id,
          originalUrl: url,
          dryRun: !args.apply,
          log: (m) => console.log(m),
        });
        newPhotos.push(newUrl);
        if (changed) {
          urlsTouched += 1;
          listingChangedAny = true;
        } else {
          urlsSkippedAlready += 1;
        }
      } catch (err) {
        console.error(`  FAIL: ${err.message}`);
        listingFailed = true;
        break;
      }
    }

    if (listingFailed) {
      listingsSkippedDueToFailure += 1;
      console.log(`  listing skipped — photos[] not updated.`);
      continue;
    }
    if (!listingChangedAny) {
      console.log(`  no changes (all photos already variant or non-Supabase).`);
      continue;
    }

    // Capture rollback before any DB write.
    rollbackLines.push(
      `UPDATE listings SET photos = ARRAY[${photos
        .map((p) => `'${p.replace(/'/g, "''")}'`)
        .join(', ')}]::text[] WHERE listing_id = '${row.listing_id}';`
    );

    if (args.apply) {
      const { error: updErr } = await supabase
        .from('listings')
        .update({ photos: newPhotos })
        .eq('listing_id', row.listing_id);
      if (updErr) {
        console.error(`  UPDATE FAILED: ${updErr.message}`);
        listingsSkippedDueToFailure += 1;
        continue;
      }
    }
    console.log(`  ${args.apply ? 'updated' : 'would update'} photos[].`);
    listingsUpdated += 1;
  }

  if (rollbackLines.length > 0) {
    const rollbackPath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      'backfill_photo_variants.rollback.sql'
    );
    writeFileSync(
      rollbackPath,
      `-- Generated by backfill_photo_variants.mjs at ${new Date().toISOString()}\n` +
        `-- Restores listings.photos[] to its pre-backfill state.\n\n` +
        rollbackLines.join('\n') +
        '\n'
    );
    console.log(`\nrollback written: ${rollbackPath}`);
  }

  console.log('');
  console.log('summary:');
  console.log(`  mode:                       ${mode}`);
  console.log(`  listings ${args.apply ? 'updated' : 'would update'}:        ${listingsUpdated}`);
  console.log(`  listings skipped (failure): ${listingsSkippedDueToFailure}`);
  console.log(`  urls processed:             ${urlsTouched}`);
  console.log(`  urls skipped (idempotent):  ${urlsSkippedAlready}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
