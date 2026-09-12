import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  Regression guard for a two-month silent outage.

  Migration 065 revoked the blanket anon SELECT on `landlords` and granted back
  only the 7 public catalog columns. `email` is deliberately not one of them.

  These three helpers all select `landlords ( … email )` to find out where to
  send. With the anon client that select returns
  `42501 permission denied for table landlords` — no row — and every one of
  them then hits a `!landlord?.email` guard and returns without sending. They
  are best-effort by contract, so they swallow it: from 2026-07-03 until this
  fix, landlord inquiry, booking and property-verification emails silently
  stopped, and nothing alerted.

  These are source-level assertions rather than behavioural ones on purpose.
  The failure is a CLIENT CHOICE, and a behavioural test would need a mock that
  reproduces PostgREST's column-grant semantics exactly — the very thing nobody
  would get right twice. Asserting the client directly is what actually pins
  the regression.
*/

const FILES = [
  'src/lib/propertyVerificationEmail.js',
  'src/lib/inquiryEmail.js',
  'src/lib/bookingEmail.js',
];

const read = (f) => readFileSync(join(process.cwd(), f), 'utf8');

describe('landlord-facing email helpers must not read landlords via the anon client', () => {
  it.each(FILES)('%s selects landlord email (so the client choice matters)', (f) => {
    // If this stops being true the rest of the file's reasoning no longer applies.
    expect(read(f)).toMatch(/landlords\s*\(\s*[^)]*email/);
  });

  it.each(FILES)('%s uses the service-role client', (f) => {
    expect(read(f)).toMatch(/getSupabaseAsService\(\)/);
  });

  it.each(FILES)('%s does NOT construct an anon client', (f) => {
    const src = read(f)
      // strip comments — they mention getSupabase() deliberately, as a warning
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/getSupabase\s*\(\s*\)/);
    expect(src).not.toMatch(/from\s+['"]@\/lib\/supabase['"]/);
  });

  it.each(FILES)('%s logs the query error instead of discarding it', (f) => {
    const src = read(f);
    // The outage was invisible because `error` was destructured away.
    expect(src).toMatch(/error:\s*listingError/);
    expect(src).toMatch(/if\s*\(\s*listingError\s*\)/);
  });
});
