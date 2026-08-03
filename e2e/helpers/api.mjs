/**
 * API helpers for e2e setup/teardown.
 * Prefer these over driving the browser for mutations; clean up even on failure.
 */

import { createClient } from '@supabase/supabase-js';
import {
  assertNotProtectedListing,
  e2eBaseUrl,
  supabasePublicConfig,
} from '../fixtures/env.mjs';

const FIXTURE_PHOTO_URLS = [
  'https://static.wixstatic.com/media/253972_0c85502821404f4fbc7cf8c633a6ac9b~mv2.jpg/v1/crop/x_18,y_0,w_4606,h_3472/fill/w_516,h_389,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/253972_0c85502821404f4fbc7cf8c633a6ac9b~mv2.jpg',
  'https://static.wixstatic.com/media/d37a3f_ffe14679646a4dada93bea0652d27839~mv2.jpg/v1/fill/w_372,h_495,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/IMG_20210725_142530.jpg',
  'https://static.wixstatic.com/media/d37a3f_b9b57d3e93c448bca103d962c1ac6570~mv2.jpg/v1/fill/w_515,h_387,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/IMG_20210725_142750.jpg',
  'https://static.wixstatic.com/media/253972_e5e32ac6b7c24f0bb87b9c76bd6222b8~mv2.jpg/v1/fill/w_373,h_497,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/253972_e5e32ac6b7c24f0bb87b9c76bd6222b8~mv2.jpg',
  'https://static.wixstatic.com/media/253972_6075044d097348699595e87c4bb820bf~mv2.jpg/v1/fill/w_508,h_382,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/253972_6075044d097348699595e87c4bb820bf~mv2.jpg',
];

export async function signInWithPassword(email, password) {
  const { url, anon } = supabasePublicConfig();
  if (!url || !anon) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for e2e auth',
    );
  }
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message || 'no session'}`);
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: data.user,
    expiresAt: data.session.expires_at,
  };
}

export async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const base = e2eBaseUrl();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { res, data, status: res.status };
}

/**
 * Create a live fixture listing owned by the e2e landlord.
 * Title is always prefixed with "E2E " so orphans are identifiable.
 */
export async function createFixtureListing(landlordToken, opts = {}) {
  const runId = opts.runId || `run-${Date.now()}`;
  const title = opts.title || `E2E fixture ${runId}`;
  const availableFrom = opts.availableFrom || '2024-01-01';
  const availableTo = opts.availableTo ?? null;

  const body = {
    submit: true,
    draft: false,
    title,
    address: opts.address || 'Egnatia 100 (E2E fixture — safe to delete)',
    neighborhood: opts.neighborhood || 'Kentro',
    lat: opts.lat ?? 40.6355,
    lng: opts.lng ?? 22.947,
    property_type: opts.propertyType || 'Studio',
    description:
      opts.description ||
      'Automated e2e fixture listing. Not a real property. Safe to delete.',
    monthly_price: opts.monthlyPrice ?? 420,
    deposit: opts.deposit ?? 420,
    agency_fee: opts.agencyFee ?? 0,
    bills_included: true,
    min_duration_months: opts.minDuration ?? 2,
    max_duration_months: opts.maxDuration ?? 12,
    available_from: availableFrom,
    available_to: availableTo,
    bedrooms: 0,
    bathrooms: 1,
    sqm: 28,
    floor: 2,
    smoking_allowed: false,
    pets_allowed: false,
    photos: [],
    external_photo_urls: FIXTURE_PHOTO_URLS.slice(0, 5),
    university_distances: opts.universityDistances || [
      { university_id: 'auth', distance_meters: 1200, source: 'landlord' },
      { university_id: 'uom', distance_meters: 2100, source: 'landlord' },
    ],
  };

  const { res, data, status } = await apiFetch('/api/landlord/listings', {
    method: 'POST',
    token: landlordToken,
    body,
  });

  if (!res.ok || !data?.listing_id) {
    throw new Error(
      `createFixtureListing failed (${status}): ${JSON.stringify(data)}`,
    );
  }

  assertNotProtectedListing(data.listing_id);
  return { listingId: data.listing_id, title, body };
}

export async function deleteFixtureListing(landlordToken, listingId) {
  if (!listingId) return;
  assertNotProtectedListing(listingId);
  const { res, data, status } = await apiFetch(
    `/api/landlord/listings/${listingId}`,
    { method: 'DELETE', token: landlordToken },
  );
  // 404 is fine (already gone). Other failures are logged but do not throw —
  // cleanup must not fail the suite after the assertion already ran.
  if (!res.ok && status !== 404) {
    console.warn(
      `[e2e cleanup] DELETE listing ${listingId} failed (${status}):`,
      data,
    );
  }
}

export async function createBookingRequest(studentToken, {
  listingId,
  moveIn,
  moveOut,
  message = 'Hello, this is an automated e2e booking request for the semester.',
}) {
  assertNotProtectedListing(listingId);
  const { res, data, status } = await apiFetch('/api/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      listing_id: listingId,
      move_in: moveIn,
      move_out: moveOut,
      message,
    },
  });
  return { res, data, status };
}

export async function patchBooking(token, bookingId, action, extra = {}) {
  return apiFetch(`/api/bookings/${bookingId}`, {
    method: 'PATCH',
    token,
    body: { action, ...extra },
  });
}

/**
 * Best-effort: cancel booking (releases availability block) then delete listing.
 * Always safe to call from afterEach/afterAll.
 */
export async function cleanupFixture({
  landlordToken,
  studentToken,
  listingId,
  bookingId,
}) {
  const errors = [];
  if (bookingId && (studentToken || landlordToken)) {
    const token = studentToken || landlordToken;
    try {
      const { res, data, status } = await patchBooking(token, bookingId, 'cancel');
      if (!res.ok && status !== 404 && status !== 409 && status !== 400) {
        errors.push(`cancel booking ${bookingId}: ${status} ${JSON.stringify(data)}`);
      }
    } catch (err) {
      errors.push(`cancel booking ${bookingId}: ${err.message}`);
    }
  }
  if (listingId && landlordToken) {
    try {
      await deleteFixtureListing(landlordToken, listingId);
    } catch (err) {
      errors.push(`delete listing ${listingId}: ${err.message}`);
    }
  }
  if (errors.length) {
    console.warn('[e2e cleanup] partial failures:', errors.join('; '));
  }
}

export async function getStudentProfile(studentToken) {
  const { res, data, status } = await apiFetch('/api/student/profile', {
    token: studentToken,
  });
  if (!res.ok) {
    throw new Error(`GET student profile failed (${status}): ${JSON.stringify(data)}`);
  }
  return data.student;
}

export async function patchStudentProfile(studentToken, updates) {
  const { res, data, status } = await apiFetch('/api/student/profile', {
    method: 'PATCH',
    token: studentToken,
    body: updates,
  });
  if (!res.ok) {
    throw new Error(
      `PATCH student profile failed (${status}): ${JSON.stringify(data)}`,
    );
  }
  return data.student;
}

/** Clear guest-profile required fields so the booking gate trips. */
export async function clearGuestProfile(studentToken) {
  return patchStudentProfile(studentToken, {
    date_of_birth: null,
    gender: null,
    nationality: null,
    languages: [],
    bio: null,
    home_university: null,
    receiving_university: null,
    receiving_faculty: null,
    funding_source: null,
  });
}

/** Fill a complete guest profile (for booking success path / restore). */
export async function completeGuestProfile(studentToken, overrides = {}) {
  return patchStudentProfile(studentToken, {
    date_of_birth: '2001-06-15',
    gender: 'woman',
    nationality: 'DE',
    languages: ['en', 'de'],
    bio: 'E2E test student on Erasmus in Thessaloniki for the academic year.',
    home_university: 'other',
    receiving_university: 'auth',
    receiving_faculty: 'auth-medical',
    funding_source: 'erasmus_grant',
    ...overrides,
  });
}

/**
 * Inject Supabase session into the browser (localStorage + httpOnly cookie).
 * Prefer this over UI login for speed; falls back to UI if storage shape fails.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ email: string, password: string }} credentials
 * @param {{ role?: 'student' | 'landlord' }} [opts]
 */
export async function establishBrowserSession(page, credentials, opts = {}) {
  const session = await signInWithPassword(credentials.email, credentials.password);
  const { url } = supabasePublicConfig();
  const ref = new URL(url).hostname.split('.')[0];
  const storageKey = `sb-${ref}-auth-token`;
  const role = opts.role || 'student';
  const home =
    role === 'landlord'
      ? '/property/thessaloniki/landlord/dashboard'
      : '/student/account';

  // Seed origin + storage before app JS boots.
  await page.goto('/api/health');
  await page.evaluate(
    ({ storageKey: key, accessToken, refreshToken, user, expiresAt }) => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt || now + 3600,
        expires_in: Math.max(60, (expiresAt || now + 3600) - now),
        token_type: 'bearer',
        user,
      };
      localStorage.setItem(key, JSON.stringify(payload));
    },
    {
      storageKey,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
      expiresAt: session.expiresAt,
    },
  );

  // Server cookie for RSCs (requireStudent / requireLandlord).
  const cookieRes = await page.request.post('/api/auth/session', {
    data: { access_token: session.accessToken },
  });
  if (!cookieRes.ok()) {
    console.warn(
      '[e2e] /api/auth/session cookie sync failed:',
      cookieRes.status(),
      await cookieRes.text(),
    );
  }

  // Load an authed surface so SessionSync + useAccessToken read the session.
  await page.goto(home);
  // If we bounced to login, fall back to the real form.
  if (page.url().includes('/login')) {
    await loginViaUi(page, {
      email: credentials.email,
      password: credentials.password,
      loginPath:
        role === 'landlord'
          ? '/property/thessaloniki/landlord/login'
          : '/student/login',
    });
  }

  return session;
}

/**
 * @param {import('@playwright/test').Page} page
 */
export async function loginViaUi(page, { email, password, loginPath }) {
  await page.goto(loginPath);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.locator('form button[type="submit"], button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 45_000,
  });
}
