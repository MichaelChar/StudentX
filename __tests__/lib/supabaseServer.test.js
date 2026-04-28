import { describe, it, expect } from 'vitest';
import { extractToken } from '@/lib/supabaseServer';

function req(authHeader) {
  return {
    headers: {
      get: (name) => (name === 'Authorization' && authHeader != null ? authHeader : null),
    },
  };
}

describe('extractToken', () => {
  it('returns the bearer value from a well-formed Authorization header', () => {
    expect(extractToken(req('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('returns null when the header is missing', () => {
    expect(extractToken(req(null))).toBeNull();
  });

  it('returns null when the scheme is not Bearer', () => {
    expect(extractToken(req('Basic dXNlcjpwYXNz'))).toBeNull();
  });

  it('returns an empty string for "Bearer " with no token (callers treat falsy as no-token)', () => {
    // Documents current behavior — extractToken doesn't validate non-empty.
    expect(extractToken(req('Bearer '))).toBe('');
  });
});
