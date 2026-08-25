/**
 * Env contract for Playwright e2e.
 * Credentials come from process.env only — never hardcode secrets here.
 */

export function e2eBaseUrl() {
  return (process.env.E2E_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
}

export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anon };
}

export function studentCredentials() {
  const email = process.env.E2E_STUDENT_EMAIL;
  const password = process.env.E2E_STUDENT_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export function landlordCredentials() {
  const email = process.env.E2E_LANDLORD_EMAIL;
  const password = process.env.E2E_LANDLORD_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

/** Optional — used only for privacy assertions on landlord reservation pages. */
export function studentEmailForPrivacyCheck() {
  return process.env.E2E_STUDENT_EMAIL || null;
}

export function hasStudentAuth() {
  return Boolean(studentCredentials());
}

export function hasLandlordAuth() {
  return Boolean(landlordCredentials());
}

export function hasBookingAuth() {
  return hasStudentAuth() && hasLandlordAuth();
}

/**
 * Real curated listings that must never be mutated or deleted by e2e.
 *
 * These are the ids actually live in prod (verified against the database,
 * 2026-08-25). The previous list — 0100001–0100004 — matched NO row in
 * `listings`, so this guard protected nothing while reading as though it did.
 *
 * A prefix guard on the landlord id is deliberately NOT used, tempting as it
 * looks: every live listing belongs to landlord 0106, which is also the only
 * landlord the e2e credentials can sign in as, so the suite's own fixtures are
 * created under 0106 too. Blocking the prefix would block the fixtures' own
 * cleanup and leak a listing per run.
 *
 * That is why this list is NOT the real protection — FIXTURE_TITLE_PREFIX is
 * (see below). This list stays as a cheap, explicit second opinion.
 */
export const PROTECTED_LISTING_IDS = Object.freeze([
  '0106001',
  '0106002',
  '0106003',
]);

/**
 * The actual stale-proof guard: every fixture the suite creates is titled
 * "E2E …" (see createFixtureListing, and the wizard journey's own
 * `E2E wizard <ts>`), so a listing whose title does NOT start with this is not
 * ours and must never be deleted.
 *
 * Unlike an id list, this cannot go out of date — a listing added to prod
 * tomorrow is protected automatically, because nobody titles a real listing
 * "E2E ".
 */
export const FIXTURE_TITLE_PREFIX = 'E2E ';

export function isFixtureTitle(title) {
  return typeof title === 'string' && title.startsWith(FIXTURE_TITLE_PREFIX);
}

export function assertNotProtectedListing(listingId) {
  if (PROTECTED_LISTING_IDS.includes(listingId)) {
    throw new Error(
      `Refusing to mutate protected listing ${listingId}. E2E must create its own fixture.`,
    );
  }
}
