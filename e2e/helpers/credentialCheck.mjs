/*
  Credential-configuration guard for the Playwright suite. Issue #439.

  A journey that skips for missing credentials exits 0 and prints a `-`,
  which is indistinguishable from a pass. That is how PR #398's assertions
  reached main unexecuted and stayed that way unnoticed.

  Two states are separated here:

    - NOTHING configured  → a legitimate opt-out. Skipping is correct; it
      just has to be LOUD, which is the coverage reporter's job.
    - HALF configured     → a misconfiguration, never an opt-out. Someone
      set E2E_LANDLORD_EMAIL and forgot the password, or a shell dropped
      one of the pair. Skipping there hides a typo behind a green run.

  DELIBERATELY STANDALONE, and not part of e2e/fixtures/env.mjs. This is
  imported by playwright.config.mjs, which loads before Playwright sets up
  its own transpiler for spec files. Importing a module from config that
  the specs ALSO import poisons Playwright's module cache for that file —
  the specs then fail with "SyntaxError: Unexpected token 'export'",
  because the copy already in cache was loaded as CommonJS. That was
  observed with an earlier version of this change that put these functions
  in env.mjs. Keep this file out of every spec's import graph.
*/

const CREDENTIAL_PAIRS = Object.freeze([
  { role: 'student', emailVar: 'E2E_STUDENT_EMAIL', passwordVar: 'E2E_STUDENT_PASSWORD' },
  { role: 'landlord', emailVar: 'E2E_LANDLORD_EMAIL', passwordVar: 'E2E_LANDLORD_PASSWORD' },
]);

/**
 * Pure over an env-like object so it is unit-testable without touching
 * process.env. Returns the pairs that are half-set.
 */
export function partialCredentialPairs(env = process.env) {
  return CREDENTIAL_PAIRS.filter(({ emailVar, passwordVar }) => {
    const hasEmail = Boolean(env[emailVar]);
    const hasPassword = Boolean(env[passwordVar]);
    return hasEmail !== hasPassword;
  }).map(({ role, emailVar, passwordVar }) => ({
    role,
    present: env[emailVar] ? emailVar : passwordVar,
    missing: env[emailVar] ? passwordVar : emailVar,
  }));
}

/** Throws when any credential pair is half-configured. */
export function assertNoPartialCredentials(env = process.env) {
  const partial = partialCredentialPairs(env);
  if (partial.length === 0) return;

  const lines = partial.map(
    (p) => `  ${p.role}: ${p.present} is set but ${p.missing} is missing`,
  );
  throw new Error(
    [
      'E2E credentials are half-configured.',
      ...lines,
      '',
      'This is a misconfiguration, not an opt-out — so the run fails instead',
      'of skipping, which would have looked identical to a pass (#439).',
      'Either set both variables in the pair, or unset both to opt out.',
    ].join('\n'),
  );
}
