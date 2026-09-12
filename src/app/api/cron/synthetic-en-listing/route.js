import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getResend } from '@/lib/resend';
import { getSupabase } from '@/lib/supabase';
import { DEFAULT_CITY } from '@/lib/cityRoutes';
import { computeUniversityDistances } from '@/lib/computeUniversityDistances';
import { MAX_DISTANCE_METERS } from '@/lib/universityDistances';
import { opsFromAddress } from '@/lib/emailFrom';
import { isCronAuthorized } from '../auth';

// Synthetic uptime check guarding against the regression class fixed in PR #48
// (see issue #49 + docs/runbooks/synthetic-en-listing.md). Originally just
// asserted that /en/listing/<id> renders English markers (the Greek-leak
// half was dropped when the site went English-only, #158); now also runs
// several production-canary checks (listing API distance variety,
// 404 status on missing listings, og-default.png served as PNG, no
// MISSING_MESSAGE next-intl placeholders on /en).
//
// All assertions run independently; one failing does not block the others.
// On any failure, emails SYNTHETIC_ALERT_EMAIL via Resend (if RESEND_API_KEY
// configured) and returns 500 with the failure list. On all-pass returns 200
// with the per-check status.
//
// Production scheduling: /api/cron/tick registry, cadence '15m'. This route
// remains as a thin manual-trigger wrapper (CRON_SECRET) for local sanity
// checks and the curl command in CLAUDE.md.

const DEFAULT_LISTING_ID = '0106002';
// 15s gives Supabase cold starts (off-peak hours) room to complete the
// 9-table listing query. Heavy WebGL page renders get a longer cap below
// (HEAVY_PAGE_TIMEOUT_MS). The master tick shares a ~25s budget across
// concurrent due jobs; this canary may time out under load — that is an
// accepted W9 risk (log line surfaces it; digests still complete).
const FETCH_TIMEOUT_MS = 15_000;
// The three heavy property-page checks SSR WebGL components (HubBackground
// 240k particles, HubDiagram, StripeGradientMesh) via the self service
// binding — a fresh render every run, no CDN cache to lean on. On a cold
// isolate that legitimately exceeds the 15s default and tripped the
// "aborted due to timeout" alerts on en-cityhub-locale / en-quiz-locale.
// They run sequentially (one SSR at a time), so a longer per-fetch cap here
// doesn't stack concurrent resource pressure.
const HEAVY_PAGE_TIMEOUT_MS = 22_000;

const EN_MARKERS_REQUIRED = [
  '<html lang="en"',
  'Sign in to message this landlord',
];

// Cloudflare "couldn't reach origin"-class status codes. The synthetic
// invokes the Worker via a service binding (env.WORKER_SELF_REFERENCE),
// but service-binding sub-fetches still surface Cloudflare's edge errors
// when the runtime hiccups mid-render — none of which are app-level
// regressions. Treating them as inconclusive (skipped) prevents false
// positives like the 2026-05-17 16:00 alert ("en-listing-locale: non-200
// status: 523"), where the listing page was healthy 30s before and after.
//   520 — unknown server error (Worker errored mid-response)
//   522 — connection timed out (already handled — Worker self-fetch loop)
//   523 — origin unreachable
//   524 — origin responded too slowly
// 521 (web server down) and 525–527 (SSL/Railgun) are deliberately left
// out — those would indicate a real outage class worth alerting on.
const INCONCLUSIVE_CF_5XX = new Set([520, 522, 523, 524]);

// A thrown fetch error is inconclusive — not an app regression — when it's a
// timeout/abort. That's the Worker self-fetch hiccup that otherwise surfaces
// as an INCONCLUSIVE_CF_5XX status; when the self-fetch never resolves it
// aborts instead ("The operation was aborted due to timeout"). The
// page-render checks (checkEnLocale) and cf-cache-status-hit already skip
// this class; the API/asset checks below share this helper so a transient
// origin timeout doesn't page us with a false positive (the 2026-07-07
// listing-api-distances alert, healthy 30s before and after).
export function skipIfInconclusiveError(name, err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return { name, ok: true, skipped: true, reason: `skipped: ${err.name}` };
  }
  return null;
}

// Synthetic-only stub cookie. Middleware checks for cookie *presence*
// only (not validity) when deciding the cache-control branch — see
// middleware.js. So any non-empty value here trips the authed branch
// and we can verify the server-side split without holding a real JWT.
const SYNTHETIC_AUTH_COOKIE = 'sb-access-token=synthetic-canary-stub';

// Resolve the self-fetcher (env.WORKER_SELF_REFERENCE) so probes hit the
// Worker directly, bypassing DNS/CDN/asset-binding interception. Returns
// null when running outside the Cloudflare runtime (local dev, unit tests),
// in which case fetchUrl falls back to global fetch.
//
// The three property-page locale checks previously used useGlobalFetch=true
// to hit the CDN cache instead of the service binding, avoiding concurrent
// SSR resource exhaustion. That caused Worker self-fetch 522s whenever the
// CDN cache was cold (post-deploy, different edge PoP). Fixed by running
// them sequentially via the service binding after the lightweight checks
// finish — one SSR at a time stays within the Worker's resource budget.
async function getSelfFetcher() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env?.WORKER_SELF_REFERENCE ?? null;
  } catch {
    return null;
  }
}

async function fetchUrl(url, { method = 'GET', cookie = '', timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const headers = { 'user-agent': 'StudentX-synthetic/1.0' };
  if (cookie) headers.cookie = cookie;
  const init = {
    method,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'manual',
  };
  const self = await getSelfFetcher();
  return self ? self.fetch(url, init) : fetch(url, init);
}

async function fetchListingHtml(url, { cookie } = {}) {
  const res = await fetchUrl(url, { cookie });
  const body = await res.text();
  return {
    status: res.status,
    body,
    cacheControl: res.headers.get('cache-control') || '',
    vary: res.headers.get('vary') || '',
    cfCacheStatus: res.headers.get('cf-cache-status') || '',
  };
}

// Cache-header expectations after the issue #67 split (PR #105):
//   anon (no sb-access-token cookie) → must include `public, s-maxage=...`
//     (middleware lets Cloudflare's edge cache the AuthGate body)
//   authed (cookie present)          → must NOT include public, s-maxage=...
//     (the body contains gated contact info; CDN-caching it would leak)
//
// The forbidden direction is the original session-leak shape the
// pre-PR-105 attempt was reverted for. The required direction is the
// new shape: if middleware ever drops back to private for anon, we
// silently lose the perf win and want to know within 15 min.
const PUBLIC_CACHE_RE = /public,\s*s-maxage=/i;

export function evaluateBody({ status, body }) {
  // Cloudflare "couldn't reach origin"-class 5xx (520/522/523/524) is
  // treated as inconclusive — see INCONCLUSIVE_CF_5XX above for the
  // full rationale. 522 is the classic self-fetch loop; 523 fired the
  // 2026-05-17 false-positive alert that prompted broadening the skip
  // set. External visitors are unaffected (their requests don't
  // self-fetch).
  if (INCONCLUSIVE_CF_5XX.has(status)) {
    return { ok: true, skipped: true, reason: `skipped: Cloudflare ${status} (inconclusive)` };
  }
  if (status !== 200) {
    return { ok: false, reason: `non-200 status: ${status}` };
  }
  for (const marker of EN_MARKERS_REQUIRED) {
    if (!body.includes(marker)) {
      return { ok: false, reason: `missing required EN marker: ${marker}` };
    }
  }
  return { ok: true };
}

// Cache-header evaluators take { status, cacheControl } and short-circuit
// on non-200 responses: a 522 / 5xx error page has its own (Cloudflare /
// upstream) cache-control header that has nothing to do with our middleware,
// and evaluateBody already flags the underlying status problem. Without
// this guard the synthetic alert double-flagged a single 522 as both
// "non-200 status" AND "anon must serve public, s-maxage=..." — the latter
// reading CF's error-page header (`private, max-age=0, no-store, no-cache,
// must-revalidate, post-check=0, pre-check=0`).
export function evaluateAnonCacheHeader({ status, cacheControl }) {
  if (status != null && status !== 200) {
    return { ok: true };
  }
  if (!PUBLIC_CACHE_RE.test(cacheControl || '')) {
    return {
      ok: false,
      reason: `anon listing detail must serve public, s-maxage=... (issue #67); got: ${cacheControl || '(none)'}`,
    };
  }
  return { ok: true };
}

export function evaluateAuthedCacheHeader({ status, cacheControl }) {
  if (status != null && status !== 200) {
    return { ok: true };
  }
  if (PUBLIC_CACHE_RE.test(cacheControl || '')) {
    return {
      ok: false,
      reason: `authed listing detail returned public, s-maxage=... — session-leak risk: ${cacheControl}`,
    };
  }
  return { ok: true };
}

/*
  `Vary: Cookie` — the assertion that makes the other two mean something.

  evaluateAnonCacheHeader and evaluateAuthedCacheHeader prove the ORIGIN
  stamps the right Cache-Control for each caller. They cannot prove the CDN
  keeps the two apart, and that is the half that actually leaks.

  Without Vary: Cookie, Cloudflare may serve the anon-cached copy to a
  request that HAS an sb-access-token — the origin is never consulted, so
  the authed check keeps passing while a cached anon body is handed to a
  signed-in user (and, worse, an authed body could be stored under a key an
  anon visitor later matches). The failure is invisible to every check that
  only inspects origin responses.

  Asserted on both fetches: the header has to be present on the anon
  response (that is the one that gets STORED) and on the authed response
  (so a future change cannot drop it on the branch that must never be
  cached). Issue #67.
*/
const VARY_COOKIE_RE = /(^|,)\s*cookie\s*(,|$)/i;

export function evaluateVaryCookie({ status, vary }, label = 'listing detail') {
  if (status != null && status !== 200) {
    return { ok: true };
  }
  if (!VARY_COOKIE_RE.test(vary || '')) {
    return {
      ok: false,
      reason:
        `${label} must send \`Vary: Cookie\` (issue #67) — without it the CDN can ` +
        `serve an anon-cached body to a signed-in request, which no ` +
        `origin-header check can detect. Got: ${vary || '(none)'}`,
    };
  }
  return { ok: true };
}

/*
  Is a CDN cache status on an AUTHED request a session leak?

  Pure half of cf-cache-authed-not-hit, exported so the leak rule itself is
  unit-tested rather than only exercised against live Cloudflare.

  Only HIT is a leak. MISS, EXPIRED, BYPASS, DYNAMIC and REVALIDATED all mean
  the origin was consulted, which is the whole requirement. An ABSENT status
  is NOT treated as a leak here — the caller has already established the CDN
  is in play (it warms anonymously and skips when no status header comes
  back), so absent at this point means the request was not served from cache.

  Issue #67 (the leak shape) / #130 (the rule that creates the opportunity).
*/
export function evaluateAuthedCacheStatus({ cacheStatus }) {
  if ((cacheStatus || '').toUpperCase() !== 'HIT') return { ok: true };
  return {
    ok: false,
    reason:
      'SESSION LEAK: an authed request (sb-access-token present) was served ' +
      'cf-cache-status: HIT — Cloudflare answered it from the anon cache entry, ' +
      'so the origin never ran and the signed-in visitor got the anonymous, ' +
      'contact-info-gated body. Disable the Cache Rule first, then check it still ' +
      'carries `not http.cookie contains "sb-access-token"` and that Vary: Cookie ' +
      'survives on the anon response (#67 / #130).',
  };
}

// Resolve which listing the four listing-dependent checks should probe.
//
// `SYNTHETIC_LISTING_ID` (wrangler.jsonc var) used to be taken on faith, on
// the assumption that its target is "permanently published". The go-live
// gates (PR #382) broke that assumption: a listing stays public only while
// its landlord ID check AND video-call verification hold, and an admin can
// take it offline at any time. A pinned ID that quietly goes offline turns
// every 15-min run into 4 failing checks and an alert email — with no dedupe
// (see the runbook's "Known limitations"), that's ~96 emails/day reporting a
// deliberate ops action, not an outage.
//
// So: trust the pin only while it's actually public, else fall back to
// whatever IS public, else report the directory as empty and let the callers
// skip. An empty public directory is a valid state — every listing awaiting
// video verification — and must not page anyone.
//
// @returns {Promise<{ listingId: string|null, reason: string|null }>}
export async function resolveSyntheticListingId(appUrl, { fetchImpl = fetchUrl } = {}) {
  const pinned = process.env.SYNTHETIC_LISTING_ID || DEFAULT_LISTING_ID;
  try {
    const res = await fetchImpl(`${appUrl}/api/listings/${pinned}`);
    if (res.status === 200) return { listingId: pinned, reason: null };
    // Cloudflare-class 5xx is inconclusive, not "gone" — keep the pin and let
    // the individual checks apply their own skip rules.
    if (INCONCLUSIVE_CF_5XX.has(res.status)) return { listingId: pinned, reason: null };
  } catch (err) {
    // A timeout here is inconclusive too — same reasoning.
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { listingId: pinned, reason: null };
    }
  }

  try {
    const res = await fetchImpl(`${appUrl}/api/listings?limit=1`);
    if (res.status !== 200) {
      return { listingId: null, reason: `listing lookup returned ${res.status}` };
    }
    const json = await res.json();
    const first = json?.listings?.[0]?.listing_id;
    if (!first) {
      return { listingId: null, reason: 'no publicly active listings' };
    }
    return { listingId: first, reason: null };
  } catch (err) {
    return {
      listingId: null,
      reason: `listing lookup threw: ${err?.name || 'Error'}`,
    };
  }
}

// --- Additional smoke assertions (all soft-fail: append to `failures`) -----

// Listing API returns ≥2 distinct walk_minutes values across faculty_distances.
// Guards against transformListing dropping the field or the seed regressing
// to all-equal distances. We just need diversity, not exact values.
async function checkListingApiDistanceVariety(appUrl, listingId) {
  const url = `${appUrl}/api/listings/${listingId}`;
  try {
    const res = await fetchUrl(url);
    if (INCONCLUSIVE_CF_5XX.has(res.status)) {
      return { name: 'listing-api-distances', ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
    }
    if (res.status !== 200) {
      return { name: 'listing-api-distances', ok: false, reason: `status ${res.status} from ${url}` };
    }
    const json = await res.json();
    const distances = json?.listing?.faculty_distances || [];
    const walks = new Set(
      distances
        .map((d) => d.walk_minutes)
        .filter((w) => w != null),
    );
    if (walks.size < 2) {
      return {
        name: 'listing-api-distances',
        ok: false,
        reason: `expected ≥2 distinct walk_minutes, got ${walks.size} (${[...walks].join(',')})`,
      };
    }
    return { name: 'listing-api-distances', ok: true };
  } catch (err) {
    return (
      skipIfInconclusiveError('listing-api-distances', err) ||
      { name: 'listing-api-distances', ok: false, reason: `fetch threw: ${err.message || err.name}` }
    );
  }
}

// Unknown listing must NOT render as HTTP 200 — that's the soft-404 SEO
// regression class this check guards against (a "Not Found" body served
// with status 200 gets indexed by crawlers).
//
// Accepts any non-200 status, not strictly 404. Reason: the listing
// layout calls notFound() for missing listings, and OpenNext's
// not-found handling on Cloudflare Workers issues an internal HTTP
// sub-request to render the not-found page; that sub-request resolves
// against the public host (studentx.uk) and 522s when reached via the
// self service-binding from this synthetic. End users on the public
// internet correctly see 404 (verified externally). 522 vs 404 doesn't
// affect users; what matters here is the 200-soft-404 class doesn't
// regress.
async function checkSoft404(appUrl) {
  const url = `${appUrl}/property/thessaloniki/listing/does-not-exist`;
  try {
    const res = await fetchUrl(url);
    if (res.status === 200) {
      return {
        name: 'soft-404',
        ok: false,
        reason: `expected non-200 (hard 404), got 200 — soft-404 SEO regression at ${url}`,
      };
    }
    return { name: 'soft-404', ok: true };
  } catch (err) {
    return (
      skipIfInconclusiveError('soft-404', err) ||
      { name: 'soft-404', ok: false, reason: `fetch threw: ${err.message || err.name}` }
    );
  }
}

// og-default.png must serve as image/png — broken paths surface as text/html
// (the Next 404 page) rather than 404, so check the content-type explicitly.
async function checkOgDefault(appUrl) {
  const url = `${appUrl}/og-default.png`;
  try {
    const res = await fetchUrl(url);
    if (INCONCLUSIVE_CF_5XX.has(res.status)) {
      return { name: 'og-default', ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
    }
    if (res.status !== 200) {
      return { name: 'og-default', ok: false, reason: `expected 200, got ${res.status} from ${url}` };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('image/png')) {
      return { name: 'og-default', ok: false, reason: `expected image/png, got "${ct}"` };
    }
    return { name: 'og-default', ok: true };
  } catch (err) {
    return (
      skipIfInconclusiveError('og-default', err) ||
      { name: 'og-default', ok: false, reason: `fetch threw: ${err.message || err.name}` }
    );
  }
}

// /api/landlord/listings without an Authorization header should return 401
// (route alive, auth-gated). A 5xx instead means the route crashed before
// reaching the auth check — historically because a SELECT referenced a
// column that didn't yet exist in prod (incident 2026-05-02, PR #85). The
// fallback SELECT added in #85 makes this 5xx unlikely, but a brand-new
// column-add in a future PR could still escape if the fallback constant
// isn't kept in sync. Catch it within 15 minutes instead of via support.
async function checkLandlordListingsApi(appUrl) {
  const url = `${appUrl}/api/landlord/listings`;
  try {
    const res = await fetchUrl(url);
    // A CF "couldn't reach origin" 5xx is infra noise, not the route crashing
    // before auth — must be skipped ahead of the >=500 check below, which
    // would otherwise read a 522 as a route crash (see INCONCLUSIVE_CF_5XX).
    if (INCONCLUSIVE_CF_5XX.has(res.status)) {
      return { name: 'landlord-listings-api', ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
    }
    if (res.status >= 500) {
      return {
        name: 'landlord-listings-api',
        ok: false,
        reason: `expected 401 (auth-gated), got ${res.status} — route is crashing before auth`,
      };
    }
    if (res.status !== 401) {
      return {
        name: 'landlord-listings-api',
        ok: false,
        reason: `expected 401, got ${res.status}`,
      };
    }
    return { name: 'landlord-listings-api', ok: true };
  } catch (err) {
    return (
      skipIfInconclusiveError('landlord-listings-api', err) ||
      { name: 'landlord-listings-api', ok: false, reason: `fetch threw: ${err.message || err.name}` }
    );
  }
}

// next-intl renders `MISSING_MESSAGE: ...` placeholders when a key is absent
// from the locale's messages bundle. Treat any such substring on /en as a
// regression — it means a translation key was added without a peer in en.json.
async function checkNoMissingMessage(appUrl) {
  const url = `${appUrl}/en`;
  try {
    const res = await fetchUrl(url);
    if (INCONCLUSIVE_CF_5XX.has(res.status)) {
      return { name: 'missing-message', ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
    }
    if (res.status !== 200 && res.status !== 307 && res.status !== 308) {
      return { name: 'missing-message', ok: false, reason: `expected 200/redirect, got ${res.status} from ${url}` };
    }
    const body = await res.text();
    if (body.includes('MISSING_MESSAGE:')) {
      const idx = body.indexOf('MISSING_MESSAGE:');
      const excerpt = body.slice(idx, idx + 120);
      return { name: 'missing-message', ok: false, reason: `MISSING_MESSAGE present: ${excerpt}` };
    }
    return { name: 'missing-message', ok: true };
  } catch (err) {
    return (
      skipIfInconclusiveError('missing-message', err) ||
      { name: 'missing-message', ok: false, reason: `fetch threw: ${err.message || err.name}` }
    );
  }
}

/*
  TIER 3 of the CARTO-key guard (issue #472) — the only layer that reaches a
  human without someone going looking.

  IT MUST INSPECT THE CLIENT BUNDLE, NOT process.env. That distinction is the
  whole reason this exists. The key is a `wrangler.jsonc` var, so inside this
  Worker `process.env.NEXT_PUBLIC_CARTO_KEY` reads back fine — while the
  browser bundle, which is what actually builds the tile URL, was compiled
  without it. A server-side env check would report a confident green over a
  watermarked map. That false green is what went unnoticed on 2026-09-06.

  WHY IT CRAWLS TWO LEVELS. `ListingsMap` is loaded with `next/dynamic`, so its
  chunk is never referenced in the page HTML — the first version of this check
  scanned only the HTML\u2019s script tags, found no CARTO URL at all, and
  returned "skipped" against a production that was actively serving the
  watermark. A monitor that reports skipped forever is worse than no monitor,
  because it looks like coverage. Measured against prod: 15 chunks in the HTML,
  none containing the tile URL; one of them names the dynamic chunk, which does.
  Sixteen fetches total, which is what CHUNK_FETCH_BUDGET is sized for.

  Skips rather than fails when it genuinely cannot tell — Cloudflare 5xx,
  timeouts, or a page with no chunks. It shares an alert email with checks that
  matter more, and a monitor that cries wolf gets muted.

  Brittleness, stated rather than hidden: it depends on Next emitting
  `/_next/static/chunks/*.js` and on chunks naming their lazy children. A
  future output shape would surface as a hard failure rather than a silent
  skip, which is the right way round.
*/
const CHUNK_FETCH_BUDGET = 40;

async function checkCartoTileKey(appUrl) {
  const name = 'carto-tile-key';
  const pageUrl = `${appUrl}/property/thessaloniki/results`;
  try {
    const res = await fetchUrl(pageUrl);
    if (INCONCLUSIVE_CF_5XX.has(res.status)) {
      return { name, ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
    }
    if (res.status !== 200) {
      return { name, ok: false, reason: `status ${res.status} from ${pageUrl}` };
    }
    const html = await res.text();
    const queue = [...new Set(html.match(/\/_next\/static\/chunks\/[^"']+?\.js/g) || [])];
    if (queue.length === 0) {
      return { name, ok: true, skipped: true, reason: 'skipped: no script chunks in page HTML' };
    }

    const seen = new Set(queue);
    let fetched = 0;
    let sawCarto = false;

    while (queue.length > 0 && fetched < CHUNK_FETCH_BUDGET) {
      const chunk = queue.shift();
      const r = await fetchUrl(`${appUrl}${chunk}`);
      fetched += 1;
      if (r.status !== 200) continue;
      const js = await r.text();

      if (js.includes('basemaps.cartocdn.com')) {
        sawCarto = true;
        if (/basemaps\.cartocdn\.com[^"'`]*\?key=/.test(js)) return { name, ok: true };
      }

      // Lazy children are named inside their parent — this is what reaches the
      // dynamically imported map chunk.
      for (const m of js.match(/static\/chunks\/[A-Za-z0-9_./-]+\.js/g) || []) {
        const url = `/_next/${m}`;
        if (!seen.has(url)) {
          seen.add(url);
          queue.push(url);
        }
      }
    }

    if (!sawCarto) {
      return {
        name,
        ok: true,
        skipped: true,
        reason: `skipped: no CARTO tile URL found in ${fetched} chunks (budget ${CHUNK_FETCH_BUDGET})`,
      };
    }
    return {
      name,
      ok: false,
      reason:
        'CARTO tile URL carries no ?key= — tiles are serving the "API KEY REQUIRED" ' +
        'watermark. NEXT_PUBLIC_CARTO_KEY is missing from the Cloudflare BUILD ' +
        'environment; a wrangler.jsonc var is runtime-only and does not reach the ' +
        'build. See #472.',
    };
  } catch (err) {
    return (
      skipIfInconclusiveError(name, err) ||
      { name, ok: false, reason: `fetch threw: ${err.message || err.name}` }
    );
  }
}

// Anon listing detail must actually be edge-cached, not merely advertise a
// cacheable Cache-Control. The header probe (en-listing-anon-cache) stayed
// green even when the deployed Cache Rule matched the wrong path and nothing
// was cached (#130). This warms the edge, then asserts a repeat fetch reports
// cf-cache-status: HIT (#131).
//
// Uses GLOBAL fetch — the public URL through Cloudflare's edge — NOT the
// WORKER_SELF_REFERENCE binding, which bypasses the CDN cache and would never
// report HIT. To avoid false alarms it skips (treats as inconclusive) on:
// an absent cf-cache-status header (local dev / not behind CF), a CF
// "couldn't reach origin" 5xx, and request timeouts/aborts. It only fails on
// a definitive non-HIT status across warmed repeats — the #130 signal.
async function checkCfCacheStatusHit(appUrl, listingId) {
  const name = 'cf-cache-status-hit';
  const url = `${appUrl}/property/thessaloniki/listing/${listingId}`;
  const probe = () =>
    fetch(url, {
      headers: { 'user-agent': 'StudentX-synthetic/1.0' },
      signal: AbortSignal.timeout(6000),
      redirect: 'manual',
    });
  try {
    await probe(); // warm the edge
    let last = '';
    // Sample twice — successive requests can land on different PoPs, so a
    // HIT on either pass is enough.
    for (let i = 0; i < 2; i++) {
      const res = await probe();
      if (INCONCLUSIVE_CF_5XX.has(res.status)) {
        return { name, ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
      }
      const cacheStatus = (res.headers.get('cf-cache-status') || '').toUpperCase();
      if (!cacheStatus) {
        return { name, ok: true, skipped: true, reason: 'skipped: no cf-cache-status header (not behind CDN)' };
      }
      if (cacheStatus === 'HIT') return { name, ok: true };
      last = cacheStatus;
    }
    return {
      name,
      ok: false,
      reason: `expected cf-cache-status: HIT on a warmed repeat fetch, got "${last}" — anon listing isn't edge-cached (see #130/#131)`,
    };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { name, ok: true, skipped: true, reason: `skipped: ${err.name}` };
    }
    return { name, ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

/*
  The other half of #131 — and the one that matters once the #130 Cache Rule
  is live.

  checkCfCacheStatusHit proves the anon body IS edge-cached. This proves the
  AUTHED request is not served that cached body. They are different failure
  modes and only this one leaks a session.

  evaluateAuthedCacheHeader and evaluateVaryCookie already assert the ORIGIN
  behaves — private Cache-Control on the authed branch, Vary: Cookie on both.
  Neither can see the CDN. If a Cache Rule is ever widened, reordered, or
  loses its `not http.cookie contains "sb-access-token"` clause, Cloudflare
  starts answering authed requests from the anon entry, the origin is never
  consulted, and every origin-side check stays green while a signed-in
  student is handed the anonymous (contact-info-gated) body. That is exactly
  the class of bug the rule change in #130 introduces the opportunity for, so
  it gets its own check rather than riding on the anon one.

  Warms the edge ANONYMOUSLY first — the point is to create a cached entry
  and then confirm the authed request refuses to match it. A HIT here is the
  failure. Skips on the same inconclusive conditions as its sibling.
*/
async function checkCfCacheAuthedNotHit(appUrl, listingId) {
  const name = 'cf-cache-authed-not-hit';
  const url = `${appUrl}/property/thessaloniki/listing/${listingId}`;
  const fetchWith = (headers) =>
    fetch(url, {
      headers: { 'user-agent': 'StudentX-synthetic/1.0', ...headers },
      signal: AbortSignal.timeout(6000),
      redirect: 'manual',
    });
  try {
    // Warm anonymously so there IS an anon entry to (wrongly) match.
    const warm = await fetchWith({});
    if (INCONCLUSIVE_CF_5XX.has(warm.status)) {
      return { name, ok: true, skipped: true, reason: `skipped: Cloudflare ${warm.status}` };
    }
    if (!warm.headers.get('cf-cache-status')) {
      return { name, ok: true, skipped: true, reason: 'skipped: no cf-cache-status header (not behind CDN)' };
    }

    const res = await fetchWith({ cookie: SYNTHETIC_AUTH_COOKIE });
    if (INCONCLUSIVE_CF_5XX.has(res.status)) {
      return { name, ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
    }
    const leak = evaluateAuthedCacheStatus({
      cacheStatus: res.headers.get('cf-cache-status'),
    });
    if (!leak.ok) return { name, ...leak };

    // Belt-and-braces: whatever the CDN did, the body it returned must not be
    // advertising itself as publicly cacheable.
    const authed = evaluateAuthedCacheHeader({
      status: res.status,
      cacheControl: res.headers.get('cache-control') || '',
    });
    return authed.ok ? { name, ok: true } : { name, ...authed };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { name, ok: true, skipped: true, reason: `skipped: ${err.name}` };
    }
    return { name, ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

// Page-render check: assert at least one expected EN marker is present
// (forgiving against copy tweaks). The Greek-leak half was dropped when the
// site went English-only (#158).
async function checkEnLocale({ name, url, anyEnMarker, timeoutMs }) {
  try {
    const res = await fetchUrl(url, { timeoutMs });
    // CF "couldn't reach origin"-class 5xx (see INCONCLUSIVE_CF_5XX).
    // Inconclusive — can't check markers, but not a regression.
    if (INCONCLUSIVE_CF_5XX.has(res.status)) {
      return { name, ok: true, skipped: true, reason: `skipped: Cloudflare ${res.status}` };
    }
    if (res.status !== 200) {
      return { name, ok: false, reason: `expected 200, got ${res.status} from ${url}` };
    }
    const body = await res.text();
    const hasEn = anyEnMarker.some((m) => body.includes(m));
    if (!hasEn) {
      return { name, ok: false, reason: `missing all EN markers: ${anyEnMarker.join(', ')}` };
    }
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

// The cron expressions we INTEND Cloudflare to have registered. MUST stay in
// sync with wrangler.jsonc `triggers.crons` (and cf/worker-entry.mjs
// CRON_ROUTES). After W9 there is a single master tick; job cadences live in
// /api/cron/tick's registry, not as separate CF triggers. This canary exists
// because the deploy pipeline does NOT sync trigger changes to the live
// Worker, and the Free plan silently rejects a 6th trigger (API error 10072).
const EXPECTED_CRONS = [
  '*/5 * * * *',
];

// Diff EXPECTED_CRONS against the schedules Cloudflare actually has registered
// for the Worker (the `/schedules` API the runbook curls by hand). Skips
// (inconclusive) when the CF API creds aren't configured, so it's a no-op
// until CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID are set as Worker secrets.
async function checkCronScheduleDrift() {
  const name = 'cron-schedule-drift';
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const scriptName = process.env.CLOUDFLARE_WORKER_NAME || 'studentx';
  if (!token || !accountId) {
    return { name, ok: true, skipped: true, reason: 'skipped: CLOUDFLARE_API_TOKEN/ACCOUNT_ID not configured' };
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/schedules`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status !== 200) {
      return { name, ok: false, reason: `CF schedules API returned ${res.status}` };
    }
    const json = await res.json();
    const live = (json?.result?.schedules || []).map((s) => s.cron);
    const liveSet = new Set(live);
    const missing = EXPECTED_CRONS.filter((c) => !liveSet.has(c));
    if (missing.length > 0) {
      return {
        name,
        ok: false,
        reason: `crons not registered on Cloudflare: ${missing.join(' | ')} (live: ${live.join(' | ') || 'none'})`,
      };
    }
    return { name, ok: true };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { name, ok: true, skipped: true, reason: `skipped: ${err.name}` };
    }
    return { name, ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

/*
  Issue #549 — every university in the city must be MEASURABLE from a pin.

  The landlord wizard's universities step is read-only: it shows one row per
  city university, each measured from the listing's map pin, and the landlord
  cannot type a number. So a university nothing can locate is not a cosmetic
  gap — it shows as "Not measured", and if fewer than two universities measure,
  the step's minimum refuses to let the listing continue (PR #542).

  That is exactly what prod was in: `faculties` held 13 rows, all AUTH, and
  university positions were derived from that table alone — so prod could
  measure one university and new listings were stuck at step 4. Nothing caught
  it, because e2e/specs/06-landlord-wizard.spec.js STUBS the distance API and
  the unit tests pass their own fixtures in. Only a call against production
  data could have seen it. Hence this check. Fixed in PR #545 (migration 119
  put campus lat/lng on `universities` as the fallback for universities with
  no faculty rows).

  The expected set is READ FROM THE DATABASE rather than hardcoded, so a
  university added later without coordinates fails the check instead of
  quietly measuring as a shorter list.
*/

// Kamara, central Thessaloniki. Any origin in the city works — the check
// asks "can every university be located from a pin", not "is this distance
// right" — but a fixed point keeps the reported metres comparable run to run.
const UNIVERSITY_CANARY_ORIGIN = { lat: 40.6321, lng: 22.9497 };

/**
 * Pure verdict for the university-distance coverage check.
 *
 * @param {{ universityIds: string[], measured: Array<{ university_id: string, distance_meters: number }> }} input
 * @returns {{ ok: boolean, reason?: string }}
 */
export function evaluateUniversityDistanceCoverage({ universityIds, measured }) {
  const name = 'university-distance-coverage';
  const expected = Array.isArray(universityIds) ? universityIds : [];
  if (expected.length === 0) {
    return { name, ok: false, reason: `no universities configured for ${DEFAULT_CITY}` };
  }

  const byId = new Map(
    (Array.isArray(measured) ? measured : []).map((d) => [d.university_id, d.distance_meters]),
  );

  const missing = expected.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    return {
      name,
      ok: false,
      reason:
        `no distance measurable for ${missing.join(', ')} ` +
        `(measured ${byId.size}/${expected.length}: ` +
        `${[...byId].map(([id, m]) => `${id} ${m}m`).join(', ') || 'none'}). ` +
        `Check that each has faculties rows or universities.lat/lng.`,
    };
  }

  // Bounds, not plausibility: 0 means the row measured against Null Island or
  // worse, and anything past the 50 km typo-guard ceiling would be rejected by
  // parseUniversityDistances on write anyway.
  const outOfRange = expected
    .map((id) => [id, byId.get(id)])
    .filter(([, m]) => !(Number.isFinite(m) && m > 0 && m <= MAX_DISTANCE_METERS));
  if (outOfRange.length > 0) {
    return {
      name,
      ok: false,
      reason: `distance out of range (0 < m <= ${MAX_DISTANCE_METERS}): ${outOfRange
        .map(([id, m]) => `${id} ${m}`)
        .join(', ')}`,
    };
  }

  return { name, ok: true };
}

async function checkUniversityDistanceCoverage() {
  const name = 'university-distance-coverage';
  try {
    const supabase = getSupabase();
    const [uniRes, facRes] = await Promise.all([
      supabase
        .from('universities')
        .select('university_id, lat, lng')
        .eq('city_slug', DEFAULT_CITY),
      supabase.from('faculties').select('faculty_id, university, lat, lng'),
    ]);

    if (uniRes.error) {
      return { name, ok: false, reason: `universities query failed: ${uniRes.error.message}` };
    }
    if (facRes.error) {
      return { name, ok: false, reason: `faculties query failed: ${facRes.error.message}` };
    }

    const universities = uniRes.data || [];
    /*
      useOsrm:false deliberately. This asks whether every university has a
      POSITION, which is a data question — routing them through the public
      OSRM demo server every 15 minutes would add an external dependency whose
      outage is not the failure we are watching for (computeUniversityDistances
      falls back to haversine anyway, so the verdict would not change). The
      straight-line numbers are enough to prove coverage.
    */
    const measured = await computeUniversityDistances(
      UNIVERSITY_CANARY_ORIGIN,
      facRes.data || [],
      { universities, useOsrm: false },
    );

    return evaluateUniversityDistanceCoverage({
      universityIds: universities.map((u) => u.university_id),
      measured,
    });
  } catch (err) {
    return (
      skipIfInconclusiveError(name, err) || {
        name,
        ok: false,
        reason: `threw: ${err?.message || err?.name || 'Error'}`,
      }
    );
  }
}

async function sendAlert({ to, subject, lines }) {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL || opsFromAddress();
  await resend.emails.send({
    from,
    to,
    subject,
    text: lines.join('\n'),
  });
}

/**
 * Core synthetic canary work (no auth). Used by the master-tick registry
 * and by the POST thin wrapper below. Returns a plain result object so
 * the tick job can log outcome without needing a Response.
 *
 * @returns {Promise<{ ok: boolean, checks?: unknown[], failures?: unknown[] }>}
 */
export async function runSyntheticEnListing() {
  const alertEmail = process.env.SYNTHETIC_ALERT_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const { listingId, reason: noListingReason } = await resolveSyntheticListingId(appUrl);
  // Step B (issue #158) collapsed the site to English-only and 301'd
  // every /en/* path to its unprefixed form. The "en-" check names are
  // kept for log/alert continuity but they now hit the canonical URL.
  const enListingUrl = `${appUrl}/property/thessaloniki/listing/${listingId}`;

  const checks = [];
  const failures = [];

  function record(name, verdict) {
    const result = { name, ...verdict };
    checks.push(result);
    if (!verdict.ok) failures.push(result);
  }

  // --- /en listing detail, anon: locale check + anon cache header ---------
  // (post-PR #105: anon must now receive public, s-maxage=... so Cloudflare
  // can cache the AuthGate body across visitors.)
  let enListingExcerpt = '';
  const skipListingChecks = listingId == null;
  const listingSkip = { ok: true, skipped: true, reason: `skipped: ${noListingReason}` };

  if (skipListingChecks) {
    record('en-listing-locale', listingSkip);
    record('en-listing-anon-cache', listingSkip);
    record('en-listing-vary-cookie', listingSkip);
    record('en-listing-authed-cache', listingSkip);
  } else {
    try {
      const fetched = await fetchListingHtml(enListingUrl);
      record('en-listing-locale', evaluateBody(fetched));
      record(
        'en-listing-anon-cache',
        evaluateAnonCacheHeader({ status: fetched.status, cacheControl: fetched.cacheControl }),
      );
      record(
        'en-listing-vary-cookie',
        evaluateVaryCookie({ status: fetched.status, vary: fetched.vary }, 'anon listing detail'),
      );
      if (fetched.status !== 200 || !checks.find((c) => c.name === 'en-listing-locale')?.ok) {
        enListingExcerpt = (fetched.body || '').slice(0, 500);
      }
    } catch (err) {
      const reason = `fetch threw: ${err.name || 'Error'} ${err.message || ''}`.trim();
      record('en-listing-locale', { ok: false, reason });
      record('en-listing-anon-cache', { ok: false, reason });
      record('en-listing-vary-cookie', { ok: false, reason });
    }

    // --- Same URL, with synthetic auth cookie: authed cache header ----------
    // (session-leak guard. Middleware checks cookie presence only, not
    // validity — any non-empty sb-access-token value trips the authed
    // branch, so we can verify the per-request split without a real JWT.)
    try {
      const fetched = await fetchListingHtml(enListingUrl, { cookie: SYNTHETIC_AUTH_COOKIE });
      const authedVary = evaluateVaryCookie(
        { status: fetched.status, vary: fetched.vary },
        'authed listing detail',
      );
      const authedCache = evaluateAuthedCacheHeader({
        status: fetched.status,
        cacheControl: fetched.cacheControl,
      });
      // One check, both conditions: the authed response must be
      // non-public AND still carry Vary: Cookie. Reporting them
      // separately would double-alert on a single middleware regression.
      record('en-listing-authed-cache', authedCache.ok ? authedVary : authedCache);
    } catch (err) {
      const reason = `fetch threw: ${err.name || 'Error'} ${err.message || ''}`.trim();
      record('en-listing-authed-cache', { ok: false, reason });
    }
  }

  // --- Additional assertions, run independently ----------------------------
  // Lightweight checks (API routes, static assets, redirects) run concurrently
  // via service binding — fast and no resource pressure.
  //
  // The two listing-scoped checks skip when nothing is public — the rest
  // (soft-404, og image, landlord-API auth, missing-message) don't need a
  // listing and keep guarding their own regression classes regardless.
  const additional = await Promise.all([
    skipListingChecks
      ? Promise.resolve({ name: 'listing-api-distances', ...listingSkip })
      : checkListingApiDistanceVariety(appUrl, listingId),
    checkSoft404(appUrl),
    checkOgDefault(appUrl),
    checkLandlordListingsApi(appUrl),
    checkNoMissingMessage(appUrl),
    skipListingChecks
      ? Promise.resolve({ name: 'cf-cache-status-hit', ...listingSkip })
      : checkCfCacheStatusHit(appUrl, listingId),
    skipListingChecks
      ? Promise.resolve({ name: 'cf-cache-authed-not-hit', ...listingSkip })
      : checkCfCacheAuthedNotHit(appUrl, listingId),
  ]);

  // Heavy property-page locale checks run sequentially via service binding.
  // These pages SSR WebGL components (HubBackground, StripeGradientMesh) that
  // are too resource-intensive to render concurrently. Sequential keeps each
  // render within the Worker's CPU budget. Previously these used global fetch
  // (CDN path) to avoid SSR, but that caused Worker self-fetch 522s whenever
  // the CDN cache was cold (post-deploy, different edge PoP).
  const heavyPageChecks = [
    {
      name: 'en-cityhub-locale',
      url: `${appUrl}/property`,
      anyEnMarker: [
        'Hover over your city',
        'Global students empowered',
        'Curated student housing',
      ],
      timeoutMs: HEAVY_PAGE_TIMEOUT_MS,
    },
    {
      name: 'en-homepage-locale',
      url: `${appUrl}/property/thessaloniki`,
      anyEnMarker: ['Take the quiz', 'See all listings', 'How it works'],
      timeoutMs: HEAVY_PAGE_TIMEOUT_MS,
    },
    {
      name: 'en-quiz-locale',
      url: `${appUrl}/property/thessaloniki/quiz`,
      anyEnMarker: ['One minute', "That's it"],
      timeoutMs: HEAVY_PAGE_TIMEOUT_MS,
    },
  ];
  for (const check of heavyPageChecks) {
    additional.push(await checkEnLocale(check));
  }
  additional.push(await checkCronScheduleDrift());
  additional.push(await checkCartoTileKey(appUrl));
  additional.push(await checkUniversityDistanceCoverage());
  for (const r of additional) {
    checks.push(r);
    if (!r.ok) failures.push(r);
  }

  if (failures.length > 0) {
    if (alertEmail && process.env.RESEND_API_KEY) {
      try {
        await sendAlert({
          to: alertEmail,
          subject: `[StudentX synthetic] ${failures.length} check${failures.length === 1 ? '' : 's'} failed`,
          lines: [
            `Synthetic check failed against ${appUrl}`,
            ``,
            `Failures (${failures.length}):`,
            ...failures.map((f) => `  - ${f.name}: ${f.reason}`),
            ``,
            `--- /en/listing HTML excerpt (first 500 chars) ---`,
            enListingExcerpt || '(n/a)',
          ],
        });
      } catch (mailErr) {
        console.error('[synthetic-en-listing] alert email failed:', mailErr);
      }
    } else {
      console.error(
        '[synthetic-en-listing] failures (no alert email sent):',
        failures.map((f) => `${f.name}: ${f.reason}`).join('; '),
      );
    }
    return { ok: false, failures, checks };
  }

  return { ok: true, checks };
}

// Thin wrapper: auth gate + HTTP status. Manual curl and the old path
// still work; production scheduling is /api/cron/tick.
export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runSyntheticEnListing();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

