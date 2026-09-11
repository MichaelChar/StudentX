import { describe, it, expect, afterEach } from 'vitest';
import {
  evaluateBody,
  evaluateAnonCacheHeader,
  evaluateAuthedCacheHeader,
  skipIfInconclusiveError,
  resolveSyntheticListingId,
  evaluateVaryCookie,
  evaluateAuthedCacheStatus,
} from '@/app/api/cron/synthetic-en-listing/route';

// Cache-header regression guards. Pre-PR #105 the canary asserted
// /en/property/listing/<id> must NEVER return public, s-maxage=... —
// that was correct then because the route was statically pinned to
// PRIVATE_CACHE_HEADERS for both anon and authed users.
//
// PR #105 split the cache-control per-request in middleware:
//   anon (no sb-access-token cookie)  → public, s-maxage=300, ...
//   authed (cookie present, any value) → private, no-cache, no-store, ...
//
// The canary now runs both directions on every tick: anon must include
// `public, s-maxage=`; authed with a synthetic stub cookie must NOT.

const PRIVATE_CC = 'private, no-cache, no-store, must-revalidate';
const PUBLIC_CC = 'public, s-maxage=300, stale-while-revalidate=86400';

const VALID_BODY = '<html lang="en"><body>Sign in to message this landlord</body></html>';
const MISSING_MARKER_BODY = '<html lang="en"><body>Welcome</body></html>';

describe('evaluateBody', () => {
  it('passes on 200 + English markers', () => {
    expect(evaluateBody({ status: 200, body: VALID_BODY })).toEqual({ ok: true });
  });

  it('fails when status is non-200', () => {
    const result = evaluateBody({ status: 500, body: VALID_BODY });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/non-200/);
  });

  it('fails when a required English marker is missing', () => {
    const result = evaluateBody({ status: 200, body: MISSING_MARKER_BODY });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing required EN marker/);
  });

  // Cloudflare "couldn't reach origin"-class 5xx is treated as inconclusive
  // (skipped) so transient infra noise doesn't fire alerts. 521 (web server
  // down) and 500 stay as real failures — those are NOT in the skip set.
  // The 2026-05-17 16:00 alert (en-listing-locale: non-200 status: 523)
  // is what prompted broadening the set beyond 522.
  describe('inconclusive CF 5xx → skipped', () => {
    for (const status of [520, 522, 523, 524]) {
      it(`treats ${status} as inconclusive`, () => {
        const result = evaluateBody({ status, body: '' });
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(true);
        expect(result.reason).toMatch(new RegExp(`Cloudflare ${status}`));
      });
    }

    it('still fails on 521 (real outage signal)', () => {
      const result = evaluateBody({ status: 521, body: '' });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/non-200 status: 521/);
    });

    it('still fails on generic 500 (app-level error)', () => {
      const result = evaluateBody({ status: 500, body: '' });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/non-200 status: 500/);
    });
  });
});

// The API/asset checks (listing-api-distances, og-default, landlord-listings-api,
// missing-message) share this helper so a Worker self-fetch timeout — the abort
// twin of an INCONCLUSIVE_CF_5XX status — is skipped, not paged. This is the
// 2026-07-07 false positive: `listing-api-distances: fetch threw: The operation
// was aborted due to timeout`, with prod healthy 30s either side.
describe('skipIfInconclusiveError', () => {
  for (const errName of ['TimeoutError', 'AbortError']) {
    it(`skips on ${errName}`, () => {
      const result = skipIfInconclusiveError('listing-api-distances', {
        name: errName,
        message: 'The operation was aborted due to timeout',
      });
      expect(result).toEqual({
        name: 'listing-api-distances',
        ok: true,
        skipped: true,
        reason: `skipped: ${errName}`,
      });
    });
  }

  it('returns null for a real error (caller hard-fails)', () => {
    expect(skipIfInconclusiveError('og-default', new TypeError('bad json'))).toBeNull();
  });

  it('returns null when err is undefined', () => {
    expect(skipIfInconclusiveError('og-default', undefined)).toBeNull();
  });
});

describe('evaluateAnonCacheHeader', () => {
  it('passes when anon response includes public, s-maxage=...', () => {
    expect(evaluateAnonCacheHeader({ status: 200, cacheControl: PUBLIC_CC })).toEqual({ ok: true });
  });

  it('passes on the comma-spaceless variant', () => {
    expect(evaluateAnonCacheHeader({ status: 200, cacheControl: 'public,s-maxage=60' })).toEqual({ ok: true });
  });

  it('fails when middleware drops back to private (anon perf regression)', () => {
    const result = evaluateAnonCacheHeader({ status: 200, cacheControl: PRIVATE_CC });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/anon listing detail must serve public/);
  });

  it('fails when the header is missing entirely', () => {
    const result = evaluateAnonCacheHeader({ status: 200, cacheControl: '' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/anon listing detail must serve public/);
  });

  // Non-200 short-circuit: a 522 / 5xx error page has its own cache-control
  // (Cloudflare's `private, max-age=0, no-store, no-cache, must-revalidate,
  // post-check=0, pre-check=0`) which has nothing to do with our middleware.
  // evaluateBody already reports the status problem; the cache check has
  // nothing useful to add and must not double-flag.
  it('passes silently on non-200 responses (defers to evaluateBody)', () => {
    expect(evaluateAnonCacheHeader({ status: 522, cacheControl: PRIVATE_CC })).toEqual({ ok: true });
    expect(evaluateAnonCacheHeader({ status: 500, cacheControl: '' })).toEqual({ ok: true });
  });
});

describe('evaluateAuthedCacheHeader', () => {
  it('passes when authed response is private/no-store', () => {
    expect(evaluateAuthedCacheHeader({ status: 200, cacheControl: PRIVATE_CC })).toEqual({ ok: true });
  });

  // Session-leak guard. If the authed branch ever returns public, s-maxage=...
  // (e.g. middleware regresses to passing the anon header through), Cloudflare
  // caches the gated body and serves it to other users. This is the original
  // failure mode that made the pre-PR-105 cache attempt unsafe to ship.
  it('fails when authed route returns public, s-maxage=... (session-leak)', () => {
    const result = evaluateAuthedCacheHeader({ status: 200, cacheControl: PUBLIC_CC });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session-leak/);
  });

  it('also catches s-maxage with no comma-space (defensive regex)', () => {
    const result = evaluateAuthedCacheHeader({ status: 200, cacheControl: 'public,s-maxage=60' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session-leak/);
  });

  it('treats empty cacheControl as ok (no public, s-maxage=)', () => {
    expect(evaluateAuthedCacheHeader({ status: 200, cacheControl: '' })).toEqual({ ok: true });
  });

  it('passes silently on non-200 responses (defers to evaluateBody)', () => {
    expect(evaluateAuthedCacheHeader({ status: 522, cacheControl: PUBLIC_CC })).toEqual({ ok: true });
  });
});

// The pinned SYNTHETIC_LISTING_ID is no longer trustworthy on its own: since
// the go-live gates (PR #382) a listing is public only while its landlord ID
// check and video-call verification hold, and an admin can take it offline
// deliberately. An offline pin used to turn every 15-min tick into four
// failing checks + an alert email (no dedupe → ~96 emails/day) for what is a
// planned ops action. resolveSyntheticListingId falls back to any live
// listing, then reports an empty directory so the callers skip instead.
describe('resolveSyntheticListingId', () => {
  const ORIGINAL = process.env.SYNTHETIC_LISTING_ID;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SYNTHETIC_LISTING_ID;
    else process.env.SYNTHETIC_LISTING_ID = ORIGINAL;
  });

  function stub(routes) {
    return async (url) => {
      for (const [fragment, response] of Object.entries(routes)) {
        if (url.includes(fragment)) return response;
      }
      throw new Error(`unstubbed url: ${url}`);
    };
  }

  it('keeps the pinned id while it is still publicly served', async () => {
    process.env.SYNTHETIC_LISTING_ID = '0106002';
    const result = await resolveSyntheticListingId('https://x', {
      fetchImpl: stub({ '/api/listings/0106002': { status: 200 } }),
    });
    expect(result).toEqual({ listingId: '0106002', reason: null });
  });

  it('falls back to a live listing when the pinned one went offline', async () => {
    process.env.SYNTHETIC_LISTING_ID = '0106002';
    const result = await resolveSyntheticListingId('https://x', {
      fetchImpl: stub({
        '/api/listings/0106002': { status: 404 },
        '/api/listings?limit=1': {
          status: 200,
          json: async () => ({ listings: [{ listing_id: '0106009' }] }),
        },
      }),
    });
    expect(result).toEqual({ listingId: '0106009', reason: null });
  });

  it('reports an empty directory rather than failing, when nothing is public', async () => {
    process.env.SYNTHETIC_LISTING_ID = '0106002';
    const result = await resolveSyntheticListingId('https://x', {
      fetchImpl: stub({
        '/api/listings/0106002': { status: 404 },
        '/api/listings?limit=1': { status: 200, json: async () => ({ listings: [] }) },
      }),
    });
    expect(result.listingId).toBeNull();
    expect(result.reason).toBe('no publicly active listings');
  });

  it('keeps the pin on an inconclusive Cloudflare 5xx (not "gone")', async () => {
    process.env.SYNTHETIC_LISTING_ID = '0106002';
    const result = await resolveSyntheticListingId('https://x', {
      fetchImpl: stub({ '/api/listings/0106002': { status: 523 } }),
    });
    expect(result).toEqual({ listingId: '0106002', reason: null });
  });

  it('keeps the pin on a timeout (inconclusive, same as a CF 5xx)', async () => {
    process.env.SYNTHETIC_LISTING_ID = '0106002';
    const result = await resolveSyntheticListingId('https://x', {
      fetchImpl: async () => {
        const err = new Error('aborted');
        err.name = 'TimeoutError';
        throw err;
      },
    });
    expect(result).toEqual({ listingId: '0106002', reason: null });
  });
});

/*
  Issue #67 — the Vary: Cookie assertion.

  evaluateAnonCacheHeader and evaluateAuthedCacheHeader prove the ORIGIN
  stamps the right Cache-Control per caller. Neither can prove the CDN keeps
  the two apart — and that is the half that leaks. Without Vary: Cookie,
  Cloudflare may hand the anon-cached body to a request carrying an
  sb-access-token; the origin is never consulted, so the authed check keeps
  passing while the leak happens.
*/
describe('evaluateVaryCookie (#67)', () => {
  it('passes on an exact Vary: Cookie', () => {
    expect(evaluateVaryCookie({ status: 200, vary: 'Cookie' })).toEqual({ ok: true });
  });

  it('passes when Cookie sits in a list', () => {
    expect(evaluateVaryCookie({ status: 200, vary: 'Accept-Encoding, Cookie' })).toEqual({
      ok: true,
    });
    expect(evaluateVaryCookie({ status: 200, vary: 'Cookie, Accept-Encoding' })).toEqual({
      ok: true,
    });
  });

  it('is case-insensitive', () => {
    expect(evaluateVaryCookie({ status: 200, vary: 'accept-encoding, cookie' })).toEqual({
      ok: true,
    });
  });

  it('FAILS when Vary is absent — the actual regression', () => {
    const r = evaluateVaryCookie({ status: 200, vary: '' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Vary: Cookie/);
    expect(r.reason).toMatch(/\(none\)/);
  });

  it('FAILS when Vary lists other headers but not Cookie', () => {
    expect(evaluateVaryCookie({ status: 200, vary: 'Accept-Encoding' }).ok).toBe(false);
  });

  it('does not match a header that merely contains the word cookie', () => {
    // `Vary: Set-Cookie` is not `Vary: Cookie` — it varies on a RESPONSE
    // header name and does nothing to separate anon from authed requests.
    // A naive includes('cookie') would pass this and report a split that
    // does not exist.
    expect(evaluateVaryCookie({ status: 200, vary: 'Set-Cookie' }).ok).toBe(false);
  });

  it('stays quiet on a non-200, like its sibling evaluators', () => {
    // A 522 error page carries Cloudflare's own headers, which say nothing
    // about our middleware. evaluateBody already flags the status.
    expect(evaluateVaryCookie({ status: 522, vary: '' })).toEqual({ ok: true });
  });

  it('labels which fetch failed', () => {
    const r = evaluateVaryCookie({ status: 200, vary: '' }, 'authed listing detail');
    expect(r.reason).toMatch(/^authed listing detail/);
  });
});

/*
  #130 turns on a Cloudflare Cache Rule for anon /property/*. The risk it
  introduces is that an AUTHED request gets answered from the anon cache
  entry — the origin never runs, so every origin-side check in this file
  stays green while a signed-in student is handed the anonymous,
  contact-info-gated body (#67).

  evaluateAuthedCacheStatus is the rule that detects it. HIT is the only
  leak; every other status means the origin was consulted.
*/
describe('evaluateAuthedCacheStatus (#130 session-leak guard)', () => {
  it('flags HIT as a session leak', () => {
    const r = evaluateAuthedCacheStatus({ cacheStatus: 'HIT' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/SESSION LEAK/);
  });

  it('is case-insensitive — Cloudflare casing must not create a blind spot', () => {
    expect(evaluateAuthedCacheStatus({ cacheStatus: 'hit' }).ok).toBe(false);
    expect(evaluateAuthedCacheStatus({ cacheStatus: 'Hit' }).ok).toBe(false);
  });

  it.each(['MISS', 'EXPIRED', 'BYPASS', 'DYNAMIC', 'REVALIDATED'])(
    'passes %s — the origin was consulted, which is the requirement',
    (status) => {
      expect(evaluateAuthedCacheStatus({ cacheStatus: status }).ok).toBe(true);
    },
  );

  it('passes an absent status — the caller has already established the CDN is in play', () => {
    expect(evaluateAuthedCacheStatus({ cacheStatus: '' }).ok).toBe(true);
    expect(evaluateAuthedCacheStatus({ cacheStatus: null }).ok).toBe(true);
    expect(evaluateAuthedCacheStatus({}).ok).toBe(true);
  });

  it('names the first remediation step, since the fix is dashboard-side', () => {
    const { reason } = evaluateAuthedCacheStatus({ cacheStatus: 'HIT' });
    expect(reason).toMatch(/Disable the Cache Rule first/);
    expect(reason).toMatch(/sb-access-token/);
  });
});
