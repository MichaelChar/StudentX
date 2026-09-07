#!/usr/bin/env node
/*
  TIER 2 of the CARTO-key guard — fail the DEPLOY build (issue #472).

  IT CHECKS THE BUILD OUTPUT, NOT THE ENVIRONMENT, and that is the whole
  design. The first version of this script ran BEFORE the build and asserted
  `process.env.NEXT_PUBLIC_CARTO_KEY` was set. It blocked a deploy that would
  have succeeded, because Node does not load `.env` files — NEXT does, inside
  `next build`. The key was correctly in `.env.production` and the preflight
  could not see it.

  That failure is instructive rather than embarrassing: an env check asserts an
  INPUT and has to know every way the value might legitimately arrive
  (.env.production, .env.local, a shell export, a CI secret, a dashboard
  variable). Grepping the emitted bundle asserts the OUTCOME — the tile URL
  actually carries a key — and is true regardless of how it got there.

  WHAT IT GUARDS. `NEXT_PUBLIC_*` are inlined at BUILD time; `wrangler.jsonc`
  `vars` are RUNTIME bindings that never reach the build. On 2026-09-06 the key
  went only into wrangler.jsonc, the build went green, and production served
  watermarked tiles. Nothing failed anywhere.

  WHY IT IS ON `cf:build` AND NOT `build`:

    npm run build      next build              ← CI, every PR
    npm run cf:build   opennextjs-cloudflare   ← Cloudflare, preview, deploy

  CI has no reason to hold a map key, and failing there would block pull
  requests over a cosmetic watermark. This runs on exactly the path that
  reaches production.

  CONSEQUENCE, STATED PLAINLY: while the key is missing this blocks deploys.
  That is the point.
*/

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CHUNK_DIR = '.next/static/chunks';
const TILE_HOST = 'basemaps.cartocdn.com';
const KEYED = /basemaps\.cartocdn\.com[^"'`]*\?key=/;

function jsFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(jsFiles(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = jsFiles(CHUNK_DIR);

if (files.length === 0) {
  console.error(
    `\n✗ ${CHUNK_DIR} has no JS chunks — cannot verify the build output.` +
      '\n  This script must run AFTER the Next build.\n',
  );
  process.exit(1);
}

let sawTileHost = false;
for (const file of files) {
  const js = readFileSync(file, 'utf8');
  if (!js.includes(TILE_HOST)) continue;
  sawTileHost = true;
  if (KEYED.test(js)) {
    console.log(`✓ CARTO tile URL is keyed in the build output (${file})`);
    process.exit(0);
  }
}

if (!sawTileHost) {
  // The map is code-split; if no chunk mentions the host at all, something
  // about the output shape changed. Say so rather than passing quietly.
  console.error(
    `\n✗ No CARTO tile URL found in any of the ${files.length} chunks under ` +
      `${CHUNK_DIR}.\n  Either the map stopped shipping, or Next's output ` +
      'shape changed and this check needs updating.\n',
  );
  process.exit(1);
}

console.error(
  '\n✗ Deploy build blocked: the CARTO tile URL carries no ?key=.\n\n' +
    '  Tiles will render with CARTO’s "API KEY REQUIRED" watermark.\n\n' +
    '  Set NEXT_PUBLIC_CARTO_KEY in .env.production — which IS committed,\n' +
    '  deliberately, and already holds the Supabase public values. Next loads\n' +
    '  it during a production build; that is how NEXT_PUBLIC_* reach the client\n' +
    '  bundle. A wrangler.jsonc `vars` entry is a RUNTIME binding and does NOT\n' +
    '  reach the build.\n\n' +
    '  See #472 and src/lib/mapTiles.js.\n',
);
process.exit(1);
