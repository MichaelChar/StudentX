import { describe, it, expect } from 'vitest';
import {
  evaluateBody,
  evaluateAnonCacheHeader,
  evaluateAuthedCacheHeader,
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
const GREEK_LEAK_BODY =
  '<html lang="en"><body>Sign in to message this landlord — Συνδέσου για να επικοινωνήσεις με τον ιδιοκτήτη</body></html>';
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

  it('fails when a forbidden Greek marker leaks onto /en/', () => {
    const result = evaluateBody({ status: 200, body: GREEK_LEAK_BODY });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/forbidden EL marker/);
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
