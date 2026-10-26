#!/usr/bin/env node
/*
  Post-deploy verification for studentx.uk — run by
  .github/workflows/post-deploy-verify.yml on every push to main.

  Cloudflare Workers Builds deploys from the Cloudflare dashboard, outside
  GitHub, so a green `main` only ever meant "it built in CI". It never meant
  "it is live". This closes that gap in three phases:

    1. WAIT until production's /version.json (stamped at build time by
       scripts/write-build-version.mjs) names the pushed commit. Times out
       if the Workers Build failed, or if an older build finished after it.
    2. SMOKE the live site: home renders the app shell, every JS/CSS chunk
       it references is actually served (a deploy that drops chunks breaks
       hydration with a 200 HTML page), the listings API answers, a listing
       detail page renders that listing, /boarding renders, and an unknown
       URL is a real 404.
    3. SETTLE: keep watching /version.json for a few minutes. Each push
       starts its own build and the LAST deploy to finish wins, so a build of
       an older commit can land after ours and silently roll prod back
       (2026-10-02, #587–#590). Seeing the SHA change here catches that.

  The smoke checks assert structure, never copy: next-intl inlines the whole
  en.json catalog into every page, so any message string matches on every
  page (see requiredListingMarkers in the synthetic canary for the history).

  Local use — smoke checks only, no waiting:
    node scripts/verify-deploy.mjs
    BASE_URL=http://localhost:8787 node scripts/verify-deploy.mjs

  Env: EXPECTED_SHA (enables phases 1 and 3), BASE_URL, WAIT_MINUTES (20),
  SETTLE_MINUTES (5).
*/

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_BASE_URL = 'https://studentx.uk';
const USER_AGENT = 'StudentX-post-deploy-verify';
const REQUEST_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 20_000;
const MAX_ASSETS = 40;

// Cloudflare edge errors are retried rather than failed — the same class the
// synthetic canary treats as inconclusive. A real outage still fails, because
// it persists past the retries.
const RETRY_STATUSES = new Set([520, 521, 522, 523, 524, 525, 526, 530]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function shortSha(sha) {
  return sha ? String(sha).slice(0, 7) : '(none)';
}

// Accepts an abbreviated SHA on either side, but never one under 7 chars:
// 'unknown' or an empty stamp must not match anything.
export function shaMatches(served, expected) {
  if (!served || !expected) return false;
  const a = String(served).toLowerCase();
  const b = String(expected).toLowerCase();
  if (Math.min(a.length, b.length) < 7) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// The /_next/static files a page's <script src> / <link href> tags load.
export function extractStaticAssets(html) {
  const re = /(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css|woff2)(?:\?[^"]*)?)"/g;
  const found = new Set();
  for (const match of html.matchAll(re)) found.add(match[1].replace(/&amp;/g, '&'));
  return [...found];
}

export async function request(url, { fetchImpl = fetch, sleep = delay, tries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'user-agent': USER_AGENT, 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!RETRY_STATUSES.has(res.status) || attempt >= tries) return res;
    } catch (err) {
      if (attempt >= tries) throw err;
    }
    await sleep(2_000 * attempt);
  }
}

// The SHA production says it is serving, or null if it can't be read
// (no version.json yet, a non-200, a network error).
export async function readServedSha(baseUrl, opts = {}) {
  try {
    const res = await request(`${baseUrl}/version.json?ts=${Date.now()}`, opts);
    if (res.status !== 200) return null;
    const body = await res.json();
    return typeof body?.sha === 'string' ? body.sha : null;
  } catch {
    return null;
  }
}

export async function waitForSha({
  baseUrl,
  expected,
  timeoutMs,
  intervalMs = POLL_INTERVAL_MS,
  fetchImpl = fetch,
  sleep = delay,
  now = Date.now,
  log = console.log,
}) {
  const start = now();
  let last;
  for (;;) {
    const served = await readServedSha(baseUrl, { fetchImpl, sleep });
    if (served !== last) {
      log(`  prod is serving ${served ? shortSha(served) : '(no readable version.json)'}`);
      last = served;
    }
    if (shaMatches(served, expected)) return { ok: true, served, elapsedMs: now() - start };
    if (now() - start >= timeoutMs) return { ok: false, served, elapsedMs: now() - start };
    await sleep(intervalMs);
  }
}

// Fails only on a readable, DIFFERENT SHA. An unreadable one is a transient
// fetch problem — phase 2 is what judges availability.
export async function watchStable({
  baseUrl,
  expected,
  durationMs,
  intervalMs = POLL_INTERVAL_MS,
  fetchImpl = fetch,
  sleep = delay,
  now = Date.now,
}) {
  const start = now();
  while (now() - start < durationMs) {
    await sleep(intervalMs);
    const served = await readServedSha(baseUrl, { fetchImpl, sleep });
    if (served && !shaMatches(served, expected)) return { ok: false, served };
  }
  return { ok: true };
}

export async function runSmokeChecks(baseUrl, { fetchImpl = fetch, sleep = delay } = {}) {
  const results = [];
  const get = (path) => request(new URL(path, baseUrl).href, { fetchImpl, sleep });
  const check = async (name, fn) => {
    try {
      results.push({ name, ok: true, detail: await fn() });
    } catch (err) {
      results.push({ name, ok: false, detail: err?.message || String(err) });
    }
  };
  const expectStatus = (res, status) => {
    if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}`);
  };
  const expectAppShell = (html) => {
    if (!html.includes('<html lang="en"')) throw new Error('no <html lang="en"> — not the app shell');
  };

  let assets = [];
  await check('home', async () => {
    const res = await get('/');
    expectStatus(res, 200);
    const html = await res.text();
    expectAppShell(html);
    assets = extractStaticAssets(html);
    return `200, ${assets.length} static assets referenced`;
  });

  await check('static-assets', async () => {
    if (assets.length === 0) throw new Error('home referenced no /_next/static assets');
    const sample = assets.slice(0, MAX_ASSETS);
    const statuses = await Promise.all(
      sample.map(async (path) => {
        const res = await get(path);
        await res.arrayBuffer();
        return { path, status: res.status };
      }),
    );
    const broken = statuses.filter((s) => s.status !== 200);
    if (broken.length) {
      throw new Error(broken.map((b) => `${b.status} ${b.path}`).join(', '));
    }
    return `${sample.length} served`;
  });

  let listingId = null;
  await check('listings-api', async () => {
    const res = await get('/api/listings?limit=1');
    expectStatus(res, 200);
    const body = await res.json();
    if (!Array.isArray(body?.listings)) throw new Error('response has no listings array');
    listingId = body.listings[0]?.listing_id ?? null;
    return listingId ? `200, first listing ${listingId}` : '200, directory is empty';
  });

  await check('listing-page', async () => {
    // An empty public directory is a valid state (every listing awaiting
    // verification) and must not fail a deploy.
    if (!listingId) return 'skipped: no public listing to render';
    const res = await get(`/property/thessaloniki/listing/${listingId}`);
    expectStatus(res, 200);
    const html = await res.text();
    if (!html.includes(`data-listing-id="${listingId}"`)) {
      throw new Error(`page did not render listing ${listingId}`);
    }
    return `200, rendered ${listingId}`;
  });

  await check('boarding', async () => {
    const res = await get('/boarding');
    expectStatus(res, 200);
    expectAppShell(await res.text());
    return '200';
  });

  await check('not-found', async () => {
    const res = await get(`/post-deploy-check-${Date.now()}`);
    await res.arrayBuffer();
    expectStatus(res, 404);
    return '404';
  });

  return results;
}

function minutesFromEnv(value, fallback) {
  const n = Number(value);
  return (Number.isFinite(n) && n >= 0 ? n : fallback) * 60_000;
}

async function main() {
  const baseUrl = (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const expected = process.env.EXPECTED_SHA?.trim() || null;
  const waitMs = minutesFromEnv(process.env.WAIT_MINUTES, 20);
  const settleMs = minutesFromEnv(process.env.SETTLE_MINUTES, 5);
  const summary = [`## Post-deploy verify — ${baseUrl}`, ''];
  const failures = [];

  if (expected) {
    console.log(`Waiting up to ${waitMs / 60_000} min for ${baseUrl} to serve ${shortSha(expected)}…`);
    const wait = await waitForSha({ baseUrl, expected, timeoutMs: waitMs });
    if (wait.ok) {
      summary.push(`- ✅ serving \`${shortSha(expected)}\` after ${Math.round(wait.elapsedMs / 1000)} s`);
    } else {
      failures.push(
        `Production never served ${shortSha(expected)} within ${waitMs / 60_000} min ` +
          `(it serves ${shortSha(wait.served)}). Either this commit's Workers Build failed, ` +
          `or an older commit's build finished after it. Check the build log in the Cloudflare ` +
          `dashboard and retry the latest main build there.`,
      );
    }
  } else {
    console.log('No EXPECTED_SHA — running the smoke checks only.');
  }

  // Smoke-testing a different build than the one pushed would prove nothing.
  if (failures.length === 0) {
    const results = await runSmokeChecks(baseUrl);
    summary.push('', '| check | result | detail |', '|---|---|---|');
    for (const r of results) {
      console.log(`${r.ok ? '✓' : '✗'} ${r.name}: ${r.detail}`);
      summary.push(`| ${r.name} | ${r.ok ? '✅' : '❌'} | ${String(r.detail).replace(/\|/g, '\\|')} |`);
      if (!r.ok) failures.push(`${r.name}: ${r.detail}`);
    }

    if (expected && settleMs > 0) {
      console.log(`Watching for a rollback for ${settleMs / 60_000} min…`);
      const stable = await watchStable({ baseUrl, expected, durationMs: settleMs });
      if (stable.ok) {
        summary.push('', `- ✅ still serving \`${shortSha(expected)}\` after ${settleMs / 60_000} min`);
      } else {
        failures.push(
          `Production switched from ${shortSha(expected)} to ${shortSha(stable.served)}: an older ` +
            `build finished last and rolled prod back. Retry the latest main build in the ` +
            `Cloudflare dashboard (CLAUDE.md, CI section).`,
        );
      }
    }
  }

  if (failures.length) {
    summary.push('', '### Failed', '', ...failures.map((f) => `- ${f}`));
    for (const f of failures) console.error(`::error::${f}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
  }
  process.exit(failures.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
