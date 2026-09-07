#!/usr/bin/env node
/*
  TIER 2 of the CARTO-key guard — fail the DEPLOY build (issue #472).

  WHY THIS IS A SEPARATE SCRIPT AND NOT A THROW IN next.config.mjs.

  Two different commands build this app:

    npm run build      next build              ← CI, on every pull request
    npm run cf:build   opennextjs-cloudflare   ← Cloudflare Workers Builds,
                                                 and `preview` / `deploy`

  CI has no `.env.local` and no reason to hold a map key, so throwing from
  `next.config.mjs` would fail every PR over a cosmetic watermark. Wiring the
  hard check into `cf:build` instead means it fires on exactly the path that
  reaches production — deterministically, with no guessing at which env
  variables Cloudflare's build container happens to set.

  WHAT IT IS GUARDING AGAINST, concretely. `NEXT_PUBLIC_*` are inlined by Next
  at BUILD time. `wrangler.jsonc` `vars` are RUNTIME bindings — they become
  `env.VAR` inside the running Worker and never reach the build container. On
  2026-09-06 the CARTO key was added to `wrangler.jsonc`, the build went green,
  and production served watermarked tiles for half an hour before anyone
  checked the bundle. The failure was silent in both directions: nothing in the
  build log, nothing in the deploy, and a map that looked fine unless you knew
  what to look for.

  CONSEQUENCE, STATED PLAINLY: while a required variable is missing, this
  blocks deploys. That is the point — but it means the Cloudflare BUILD
  variable must be set BEFORE this lands, or the site cannot ship.
*/

const REQUIRED = [
  {
    name: 'NEXT_PUBLIC_CARTO_KEY',
    why: 'CARTO basemap tiles render with an "API KEY REQUIRED" watermark without it.',
    where:
      '.env.production — which IS committed, deliberately, and already holds the\n' +
      '    Supabase public values. Next loads it during a production build; that is\n' +
      '    how NEXT_PUBLIC_* reach the client bundle on Cloudflare. A wrangler.jsonc\n' +
      '    `vars` entry is a RUNTIME binding and does NOT reach the build.',
    issue: '#472',
  },
];

const missing = REQUIRED.filter((v) => !process.env[v.name]);

if (missing.length === 0) {
  console.log(
    `✓ build env OK — ${REQUIRED.map((v) => v.name).join(', ')} present`,
  );
  process.exit(0);
}

console.error('\n✗ Deploy build blocked: required build variable(s) missing.\n');
for (const v of missing) {
  console.error(`  ${v.name}`);
  console.error(`    ${v.why}`);
  console.error(`    Set it in: ${v.where}`);
  console.error(`    See ${v.issue}.\n`);
}
console.error(
  '  This check runs only on `npm run cf:build` (Cloudflare deploys,\n' +
    '  `npm run preview`, `npm run deploy`). CI’s `npm run build` is\n' +
    '  deliberately unaffected — see the header of this file.\n',
);
process.exit(1);
