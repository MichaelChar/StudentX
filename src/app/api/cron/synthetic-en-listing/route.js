import { NextResponse } from 'next/server';
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

async function fetchUrl(url, { method = 'GET' } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'user-agent': 'StudentX-synthetic/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'manual',
  });
  return res;
}

async function fetchListingHtml(url) {
  const res = await fetchUrl(url);
  const body = await res.text();
  return {
    status: res.status,
    body,
    cacheControl: res.headers.get('cache-control') || '',
  };
}

// Auth-gated routes must NOT serve `public, s-maxage=...` — that would let
// CF cache the gated body and serve it to a different viewer. Static
// next.config.mjs rules win over Next runtime stamping (see PR #64 +
// issue #67), so misconfiguring the headers config is the realistic
// regression. Catch it on every cron tick.
const FORBIDDEN_PUBLIC_CACHE_RE = /public,\s*s-maxage=/i;

export function evaluateBody({ status, body, cacheControl }) {
  if (status !== 200) {
    return { ok: false, reason: `non-200 status: ${status}` };
  }
  if (FORBIDDEN_PUBLIC_CACHE_RE.test(cacheControl)) {
    return {
      ok: false,
      reason: `forbidden public cache header on auth-gated route: ${cacheControl}`,
    };
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

// Unknown listing should hit notFound() and serve the locale-aware 404 page
// with HTTP 404. Greek is the default at root, so we hit `/listing/...`,
// not `/en/listing/...`.
async function checkSoft404(appUrl) {
  const url = `${appUrl}/listing/does-not-exist`;
  try {
    const res = await fetchUrl(url);
    if (res.status !== 404) {
      return { name: 'soft-404', ok: false, reason: `expected 404, got ${res.status} from ${url}` };
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

// next-intl renders `MISSING_MESSAGE: ...` placeholders when a key is absent
// from the locale's messages bundle. Treat any such substring on /en as a
// regression — it means a translation key was added without a peer in en.json.
async function checkNoMissingMessage(appUrl) {
  const url = `${appUrl}/en`;
  try {
    const res = await fetchUrl(url);
    if (res.status !== 200) {
      return { name: 'missing-message', ok: false, reason: `expected 200, got ${res.status} from ${url}` };
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

async function sendAlert({ to, subject, lines }) {
  const resend = getResend();
  // Default from-address mirrors PR #51 / #63 — the verified-Resend
  // subdomain that's standard across all outbound paths once the
  // domain lands. Kept as a hardcoded fallback in case
  // RESEND_FROM_EMAIL env var isn't set.
  const from = process.env.RESEND_FROM_EMAIL || 'StudentX Alerts <alerts@updates.studentx.gr>';
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
  const enListingUrl = `${appUrl}/en/listing/${listingId}`;

  const checks = [];
  const failures = [];

  // --- Original assertion: /en/listing renders without Greek leakage -------
  let enListingExcerpt = '';
  try {
    const fetched = await fetchListingHtml(enListingUrl);
    const verdict = evaluateBody(fetched);
    if (verdict.ok) {
      checks.push({ name: 'en-listing-locale', ok: true });
    } else {
      enListingExcerpt = (fetched.body || '').slice(0, 500);
      const failure = { name: 'en-listing-locale', ok: false, reason: verdict.reason };
      checks.push(failure);
      failures.push(failure);
    }
  } catch (err) {
    const reason = `fetch threw: ${err.name || 'Error'} ${err.message || ''}`.trim();
    const failure = { name: 'en-listing-locale', ok: false, reason };
    checks.push(failure);
    failures.push(failure);
  }

  // --- Additional assertions, run independently ----------------------------
  const additional = await Promise.all([
    checkListingApiDistanceVariety(appUrl, listingId),
    checkSoft404(appUrl),
    checkOgDefault(appUrl),
    checkNoMissingMessage(appUrl),
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
