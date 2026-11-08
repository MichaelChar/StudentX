import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { DEFAULT_CITY } from '@/lib/cityRoutes';
import { BOARDING_ENABLED, PARKED_HOME_TARGET, isBoardingPath } from '@/lib/boardingParked';

// The /boarding product is parked (src/lib/boardingParked.js). The redirect
// itself lives in src/middleware.js, which can't be imported under Vitest
// (next-intl's ESM build) — see cityPicker.test.js — so it is checked over
// HTTP; what is pinned here is everything the middleware decides *from*.
describe('boardingParked', () => {
  it('parks on the housing landing while disabled, and nowhere once enabled', () => {
    if (BOARDING_ENABLED) expect(PARKED_HOME_TARGET).toBeNull();
    else expect(PARKED_HOME_TARGET).toBe(`/property/${DEFAULT_CITY}`);
  });

  it('matches /boarding and everything under it', () => {
    for (const p of [
      '/boarding',
      '/boarding/',
      '/boarding/partners',
      '/boarding/quiz',
      '/boarding/quiz/embed',
    ]) {
      expect(isBoardingPath(p), p).toBe(true);
    }
  });

  it('does not match lookalikes', () => {
    for (const p of [
      '/',
      '/boardingx',
      '/onboarding',
      '/property/thessaloniki/landlord/onboarding',
      '/admissions',
      '/api/boarding/lead',
    ]) {
      expect(isBoardingPath(p), p).toBe(false);
    }
  });

  // public/boarding/embed.js is a static file: it is served before the Worker
  // runs, so it cannot read the flag. Partners have its URL pasted on their own
  // sites, so while parked it is a no-op stub rather than a 404. This is the
  // guard against flipping BOARDING_ENABLED and forgetting to restore the file
  // (or the reverse).
  describe('public/boarding/embed.js', () => {
    const source = readFileSync(join(process.cwd(), 'public/boarding/embed.js'), 'utf8');

    it('agrees with the flag', () => {
      const injectsIframe = source.includes("document.createElement('iframe')");
      expect(injectsIframe).toBe(BOARDING_ENABLED);
    });

    it('stays a valid script that does nothing when parked', () => {
      if (BOARDING_ENABLED) return;
      // No `document` here, so anything that touched the page would throw.
      expect(() => new Function(source)()).not.toThrow();
      expect(source).not.toContain('XMLHttpRequest');
      expect(source).not.toContain('fetch(');
    });
  });
});
