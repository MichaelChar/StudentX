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
