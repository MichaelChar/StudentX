import { describe, it, expect } from 'vitest';
import {
  partialCredentialPairs,
  assertNoPartialCredentials,
} from '../../e2e/helpers/credentialCheck.mjs';

/*
  Issue #439. The Playwright suite skips when credentials are absent, and a
  skip exits 0 and prints a `-` — indistinguishable from a pass. That is how
  PR #398's assertions reached main unexecuted.

  A full opt-out still skips (correctly). A HALF-configured pair does not:
  that is a typo, not a decision, and must fail the run.

  These functions are pure over an env-like object precisely so this
  behaviour can be tested here, without a browser or a Playwright run.
*/

const BOTH = {
  E2E_STUDENT_EMAIL: 's@example.com',
  E2E_STUDENT_PASSWORD: 'pw',
  E2E_LANDLORD_EMAIL: 'l@example.com',
  E2E_LANDLORD_PASSWORD: 'pw',
};

describe('partialCredentialPairs', () => {
  it('finds nothing when both pairs are fully set', () => {
    expect(partialCredentialPairs(BOTH)).toEqual([]);
  });

  it('finds nothing when NOTHING is set — a full opt-out is legitimate', () => {
    expect(partialCredentialPairs({})).toEqual([]);
  });

  it('flags a pair missing its password', () => {
    expect(partialCredentialPairs({ E2E_LANDLORD_EMAIL: 'l@example.com' })).toEqual([
      { role: 'landlord', present: 'E2E_LANDLORD_EMAIL', missing: 'E2E_LANDLORD_PASSWORD' },
    ]);
  });

  it('flags a pair missing its email', () => {
    expect(partialCredentialPairs({ E2E_STUDENT_PASSWORD: 'pw' })).toEqual([
      { role: 'student', present: 'E2E_STUDENT_PASSWORD', missing: 'E2E_STUDENT_EMAIL' },
    ]);
  });

  it('treats an empty string as unset, not as configured', () => {
    // A shell that exports an empty value is the common way to half-configure
    // this by accident, so it must count as missing rather than present.
    expect(partialCredentialPairs({ ...BOTH, E2E_LANDLORD_PASSWORD: '' })).toEqual([
      { role: 'landlord', present: 'E2E_LANDLORD_EMAIL', missing: 'E2E_LANDLORD_PASSWORD' },
    ]);
  });

  it('flags both pairs independently', () => {
    const partial = partialCredentialPairs({
      E2E_STUDENT_EMAIL: 's@example.com',
      E2E_LANDLORD_PASSWORD: 'pw',
    });
    expect(partial.map((p) => p.role).sort()).toEqual(['landlord', 'student']);
  });
});

describe('assertNoPartialCredentials', () => {
  it('does not throw when fully configured', () => {
    expect(() => assertNoPartialCredentials(BOTH)).not.toThrow();
  });

  it('does not throw when fully unconfigured', () => {
    expect(() => assertNoPartialCredentials({})).not.toThrow();
  });

  it('throws naming both the variable present and the one missing', () => {
    expect(() => assertNoPartialCredentials({ E2E_LANDLORD_EMAIL: 'l@example.com' })).toThrow(
      /E2E_LANDLORD_EMAIL is set but E2E_LANDLORD_PASSWORD is missing/,
    );
  });
});
