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
 * Fixture listings are created under the e2e landlord and cleaned up by id.
 */
export const PROTECTED_LISTING_IDS = Object.freeze([
  '0100001',
  '0100002',
  '0100003',
  '0100004',
]);

export function assertNotProtectedListing(listingId) {
  if (PROTECTED_LISTING_IDS.includes(listingId)) {
    throw new Error(
      `Refusing to mutate protected listing ${listingId}. E2E must create its own fixture.`,
    );
  }
}
