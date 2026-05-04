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

const VALID_BODY = '<html lang="en"><body>Sign in to view this listing</body></html>';
// Includes the required English marker so we trip the EL check, not the
// missing-EN check. (evaluateBody runs required-EN-markers BEFORE
// forbidden-EL-markers; a real Greek leak in production would have both
// signals because the page renders the el namespace's title verbatim.)
const GREEK_LEAK_BODY =
  '<html lang="en"><body>Sign in to view this listing — Συνδέσου για να δεις την αγγελία</body></html>';
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
    expect(evaluateAnonCacheHeader(PUBLIC_CC)).toEqual({ ok: true });
  });

  it('passes on the comma-spaceless variant', () => {
    expect(evaluateAnonCacheHeader('public,s-maxage=60')).toEqual({ ok: true });
  });

  it('fails when middleware drops back to private (anon perf regression)', () => {
    const result = evaluateAnonCacheHeader(PRIVATE_CC);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/anon listing detail must serve public/);
  });

  it('fails when the header is missing entirely', () => {
    const result = evaluateAnonCacheHeader('');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/anon listing detail must serve public/);
  });
});

describe('evaluateAuthedCacheHeader', () => {
  it('passes when authed response is private/no-store', () => {
    expect(evaluateAuthedCacheHeader(PRIVATE_CC)).toEqual({ ok: true });
  });

  // Session-leak guard. If the authed branch ever returns public, s-maxage=...
  // (e.g. middleware regresses to passing the anon header through), Cloudflare
  // caches the gated body and serves it to other users. This is the original
  // failure mode that made the pre-PR-105 cache attempt unsafe to ship.
  it('fails when authed route returns public, s-maxage=... (session-leak)', () => {
    const result = evaluateAuthedCacheHeader(PUBLIC_CC);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session-leak/);
  });

  it('also catches s-maxage with no comma-space (defensive regex)', () => {
    const result = evaluateAuthedCacheHeader('public,s-maxage=60');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session-leak/);
  });

  it('treats empty cacheControl as ok (no public, s-maxage=)', () => {
    expect(evaluateAuthedCacheHeader('')).toEqual({ ok: true });
  });
});
