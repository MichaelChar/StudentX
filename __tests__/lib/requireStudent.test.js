import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers before importing the SUT — the SUT awaits headers()
// at call time, so the mock just needs a settable cookieHeader.
let cookieHeader = '';
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name) => (name === 'cookie' ? cookieHeader : null),
  })),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

// Mock the auth-cookies module so the test's expected cookie name is
// pinned regardless of future renames in the source.
vi.mock('@/lib/authCookies', () => ({
  SB_ACCESS_TOKEN_COOKIE: 'sb-access-token',
}));

// Mock supabaseServer so the requireStudent re-export in the same module
// doesn't try to hit a real Supabase instance during import.
vi.mock('@/lib/supabaseServer', () => ({
  getUserFromToken: vi.fn(async () => null),
  getSupabaseWithToken: vi.fn(),
}));

const { hasAuthCookie } = await import('@/lib/requireStudent');

beforeEach(() => {
  cookieHeader = '';
});

describe('hasAuthCookie', () => {
  it('returns false when no Cookie header is present', async () => {
    cookieHeader = '';
    expect(await hasAuthCookie()).toBe(false);
  });

  it('returns false when Cookie header has no sb-access-token', async () => {
    cookieHeader = 'theme=dark; consent=accepted';
    expect(await hasAuthCookie()).toBe(false);
  });

  it('returns true when sb-access-token is the only cookie', async () => {
    cookieHeader = 'sb-access-token=eyJhbGc';
    expect(await hasAuthCookie()).toBe(true);
  });

  it('returns true when sb-access-token is present alongside others', async () => {
    cookieHeader = 'theme=dark; sb-access-token=eyJhbGc; consent=accepted';
    expect(await hasAuthCookie()).toBe(true);
  });

  // Documented edge case in PR #64 review: a hypothetical cookie literally
  // named `xsb-access-token=...` would substring-match. Cost is one wasted
  // Supabase call (the authenticated branch returns null). Behavior pinned
  // here so a future stricter check is an intentional decision, not a
  // surprise regression.
  it('substring-matches xsb-access-token (known false-positive, harmless)', async () => {
    cookieHeader = 'xsb-access-token=somevalue';
    expect(await hasAuthCookie()).toBe(true);
  });
});
