import { describe, it, expect } from 'vitest';
import { evaluateBody } from '@/app/api/cron/synthetic-en-listing/route';

// The cache-header regression guard added in PR #64. Issue #67 tracks
// the deferred middleware-level anon/auth split that would let listing
// routes safely return public cache. Until that ships, evaluateBody
// must fail loudly if /en/listing/<id> ever returns public, s-maxage=...
// — that's the session-leak shape the original cache-rework attempt
// was reverted to avoid.

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
  it('passes on 200 + English markers + private cache', () => {
    expect(
      evaluateBody({ status: 200, body: VALID_BODY, cacheControl: PRIVATE_CC }),
    ).toEqual({ ok: true });
  });

  it('fails when status is non-200', () => {
    const result = evaluateBody({ status: 500, body: VALID_BODY, cacheControl: PRIVATE_CC });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/non-200/);
  });

  // The whole point of issue #67. If anyone re-promotes /listing/* to
  // PUBLIC_CACHE_HEADERS without doing the middleware split first, this
  // assertion catches it on the next 15-min cron tick.
  it('fails when auth-gated route returns public, s-maxage=... (session-leak guard)', () => {
    const result = evaluateBody({ status: 200, body: VALID_BODY, cacheControl: PUBLIC_CC });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/forbidden public cache header/);
  });

  it('also catches s-maxage with no comma-space (defensive regex)', () => {
    const result = evaluateBody({
      status: 200,
      body: VALID_BODY,
      cacheControl: 'public,s-maxage=60',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/forbidden public cache header/);
  });

  it('fails when a required English marker is missing', () => {
    const result = evaluateBody({
      status: 200,
      body: MISSING_MARKER_BODY,
      cacheControl: PRIVATE_CC,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing required EN marker/);
  });

  it('fails when a forbidden Greek marker leaks onto /en/', () => {
    const result = evaluateBody({
      status: 200,
      body: GREEK_LEAK_BODY,
      cacheControl: PRIVATE_CC,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/forbidden EL marker/);
  });

  it('treats empty cacheControl as ok (private branch via missing header)', () => {
    expect(
      evaluateBody({ status: 200, body: VALID_BODY, cacheControl: '' }),
    ).toEqual({ ok: true });
  });
});
