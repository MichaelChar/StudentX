import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getResend } from '@/lib/resend';

// Synthetic uptime check guarding against the regression class fixed in PR #48
// (see issue #49 + docs/runbooks/synthetic-en-listing.md). Originally just
// asserted that /en/listing/<id> renders English markers + no Greek leakage;
// now also runs four production-canary checks (listing API distance variety,
// 404 status on missing listings, og-default.png served as PNG, no
// MISSING_MESSAGE next-intl placeholders on /en).
//
// All assertions run independently; one failing does not block the others.
// On any failure, emails SYNTHETIC_ALERT_EMAIL via Resend (if RESEND_API_KEY
// configured) and returns 500 with the failure list. On all-pass returns 200
// with the per-check status. Triggered by cf/worker-entry.mjs on the
// */15 * * * * cron. Also callable manually with the CRON_SECRET for local
// sanity checks.

const DEFAULT_LISTING_ID = '0100006';
const FETCH_TIMEOUT_MS = 10_000;

const EN_MARKERS_REQUIRED = [
  '<html lang="en"',
  'Sign in to view this listing',
];
const EL_MARKERS_FORBIDDEN = [
  'lang="el"',
  'Συνδέσου',
];

function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === secret;
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
// Heads-up for future maintainers: the three /en/property/* page-locale
// checks deliberately opt out of this binding via useGlobalFetch=true. The
// service binding bypasses the CDN cache and forces fresh SSR on every
// probe — which is fine for the AuthGate listing detail (cheap render)
// and for API routes (no SSR), but tips the heavy property pages over
// the Worker's resource limits when the 8 checks run concurrently
// (HubBackground 240k particles + HubDiagram + StripeGradientMesh
// WebGL all SSR-walking at once → 503/timeout). Those checks only need
// HTML marker presence, so a CDN-cached response is fine; please don't
// "unify" them back onto the service binding without rethinking the
// concurrency model.
async function getSelfFetcher() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env?.WORKER_SELF_REFERENCE ?? null;
  } catch {
    return null;
  }
}

async function fetchUrl(url, { method = 'GET', cookie = '', useGlobalFetch = false } = {}) {
  const headers = { 'user-agent': 'StudentX-synthetic/1.0' };
  if (cookie) headers.cookie = cookie;
  const init = {
    method,
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'manual',
  };
  if (useGlobalFetch) return fetch(url, init);
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
  if (status !== 200) {
    return { ok: false, reason: `non-200 status: ${status}` };
  }
  for (const marker of EN_MARKERS_REQUIRED) {
    if (!body.includes(marker)) {
      return { ok: false, reason: `missing required EN marker: ${marker}` };
    }
  }
  for (const marker of EL_MARKERS_FORBIDDEN) {
    if (body.includes(marker)) {
      return { ok: false, reason: `forbidden EL marker present: ${marker}` };
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

// --- Additional smoke assertions (all soft-fail: append to `failures`) -----

// Listing API returns ≥2 distinct walk_minutes values across faculty_distances.
// Guards against transformListing dropping the field or the seed regressing
// to all-equal distances. We just need diversity, not exact values.
async function checkListingApiDistanceVariety(appUrl, listingId) {
  const url = `${appUrl}/api/listings/${listingId}`;
  try {
    const res = await fetchUrl(url);
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
    return { name: 'listing-api-distances', ok: false, reason: `fetch threw: ${err.message || err.name}` };
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
    return { name: 'soft-404', ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

// og-default.png must serve as image/png — broken paths surface as text/html
// (the Next 404 page) rather than 404, so check the content-type explicitly.
async function checkOgDefault(appUrl) {
  const url = `${appUrl}/og-default.png`;
  try {
    const res = await fetchUrl(url);
    if (res.status !== 200) {
      return { name: 'og-default', ok: false, reason: `expected 200, got ${res.status} from ${url}` };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('image/png')) {
      return { name: 'og-default', ok: false, reason: `expected image/png, got "${ct}"` };
    }
    return { name: 'og-default', ok: true };
  } catch (err) {
    return { name: 'og-default', ok: false, reason: `fetch threw: ${err.message || err.name}` };
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
    return { name: 'landlord-listings-api', ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

// next-intl renders `MISSING_MESSAGE: ...` placeholders when a key is absent
// from the locale's messages bundle. Treat any such substring on /en as a
// regression — it means a translation key was added without a peer in en.json.
async function checkNoMissingMessage(appUrl) {
  const url = `${appUrl}/en`;
  try {
    const res = await fetchUrl(url);
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
    return { name: 'missing-message', ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

// Generic /en/* locale check: assert at least one EN-only marker is present
// and no EL-only marker leaks through. Caller passes a list of EN markers
// any of which is sufficient (forgiving against copy tweaks) and a list of
// EL forbidden markers all of which must be absent.
async function checkEnLocale({ name, url, anyEnMarker, forbidElMarkers, useGlobalFetch = false }) {
  try {
    const res = await fetchUrl(url, { useGlobalFetch });
    if (res.status !== 200) {
      return { name, ok: false, reason: `expected 200, got ${res.status} from ${url}` };
    }
    const body = await res.text();
    const hasEn = anyEnMarker.some((m) => body.includes(m));
    if (!hasEn) {
      return { name, ok: false, reason: `missing all EN markers: ${anyEnMarker.join(', ')}` };
    }
    const leakedEl = forbidElMarkers.find((m) => body.includes(m));
    if (leakedEl) {
      return { name, ok: false, reason: `forbidden EL marker present: ${leakedEl}` };
    }
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, reason: `fetch threw: ${err.message || err.name}` };
  }
}

async function sendAlert({ to, subject, lines }) {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL || 'StudentX Alerts <alerts@studentx.uk>';
  await resend.emails.send({
    from,
    to,
    subject,
    text: lines.join('\n'),
  });
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listingId = process.env.SYNTHETIC_LISTING_ID || DEFAULT_LISTING_ID;
  const alertEmail = process.env.SYNTHETIC_ALERT_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const enListingUrl = `${appUrl}/en/property/thessaloniki/listing/${listingId}`;

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
  try {
    const fetched = await fetchListingHtml(enListingUrl);
    record('en-listing-locale', evaluateBody(fetched));
    record(
      'en-listing-anon-cache',
      evaluateAnonCacheHeader({ status: fetched.status, cacheControl: fetched.cacheControl }),
    );
    if (fetched.status !== 200 || !checks.find((c) => c.name === 'en-listing-locale')?.ok) {
      enListingExcerpt = (fetched.body || '').slice(0, 500);
    }
  } catch (err) {
    const reason = `fetch threw: ${err.name || 'Error'} ${err.message || ''}`.trim();
    record('en-listing-locale', { ok: false, reason });
    record('en-listing-anon-cache', { ok: false, reason });
  }

  // --- Same URL, with synthetic auth cookie: authed cache header ----------
  // (session-leak guard. Middleware checks cookie presence only, not
  // validity — any non-empty sb-access-token value trips the authed
  // branch, so we can verify the per-request split without a real JWT.)
  try {
    const fetched = await fetchListingHtml(enListingUrl, { cookie: SYNTHETIC_AUTH_COOKIE });
    record(
      'en-listing-authed-cache',
      evaluateAuthedCacheHeader({ status: fetched.status, cacheControl: fetched.cacheControl }),
    );
  } catch (err) {
    const reason = `fetch threw: ${err.name || 'Error'} ${err.message || ''}`.trim();
    record('en-listing-authed-cache', { ok: false, reason });
  }

  // --- Additional assertions, run independently ----------------------------
  const additional = await Promise.all([
    checkListingApiDistanceVariety(appUrl, listingId),
    checkSoft404(appUrl),
    checkOgDefault(appUrl),
    checkLandlordListingsApi(appUrl),
    checkNoMissingMessage(appUrl),
    // Sitewide /en/* locale guards. The /en/listing/[id] check above only
    // catches regressions on that route; this caught a sitewide regression
    // (PR #109) where every /en/* page rendered Greek because of poisoned
    // next-intl request scope. Any one of these failing means /en/* dropped
    // back to default-locale rendering somewhere in the layout chain.
    // City-hub landing (post Phase-1 multi-city refactor) — distinct from
    // the per-city Propylaea landing checked below.
    // These three checks use global fetch (CDN path) instead of the
    // self service-binding — see the comment on getSelfFetcher above.
    // The locale assertions only need HTML marker presence, so a
    // CDN-cached response satisfies them; routing them through the
    // service binding triggers concurrent fresh SSR of the heavy
    // property pages and 503s the Worker.
    checkEnLocale({
      name: 'en-cityhub-locale',
      url: `${appUrl}/en/property`,
      useGlobalFetch: true,
      anyEnMarker: [
        'Hover over your city',
        'Global students empowered',
        'Curated student housing',
      ],
      forbidElMarkers: [
        'Πέρασε πάνω από την πόλη',
        'Φοιτητές παγκοσμίως',
        'Επιλεγμένη φοιτητική στέγη',
      ],
    }),
    checkEnLocale({
      name: 'en-homepage-locale',
      url: `${appUrl}/en/property/thessaloniki`,
      useGlobalFetch: true,
      anyEnMarker: ['Take the quiz', 'See all listings', 'How it works'],
      forbidElMarkers: ['Κάνε το κουίζ', 'Δες όλες τις αγγελίες'],
    }),
    checkEnLocale({
      name: 'en-quiz-locale',
      url: `${appUrl}/en/property/thessaloniki/quiz`,
      useGlobalFetch: true,
      anyEnMarker: ['One minute', "That's it"],
      forbidElMarkers: ['Ένα λεπτό', 'Συνέχεια'],
    }),
  ]);
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
    return NextResponse.json({ ok: false, failures, checks }, { status: 500 });
  }

  return NextResponse.json({ ok: true, checks });
}
