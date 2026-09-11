/**
 * API helpers for e2e setup/teardown.
 * Prefer these over driving the browser for mutations; clean up even on failure.
 */

import { createClient } from '@supabase/supabase-js';
import {
  assertNotProtectedListing,
  isFixtureTitle,
  FIXTURE_TITLE_PREFIX,
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

/*
  Service-role client, for arranging state the app deliberately will not let a
  landlord arrange (see publishFixtureListing). Kept out of fixtures/env.mjs
  because that module is imported by every spec and this key must not spread.
*/
function serviceClient() {
  const { url } = supabasePublicConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required to publish e2e fixtures — the ' +
        'booking journeys cannot run without it, because a landlord-submitted ' +
        'listing is not bookable until admin go-live.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

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
  await publishFixtureListing(data.listing_id, title);
  return { listingId: data.listing_id, title, body };
}

/*
  Promote a fixture to publicly bookable.

  WHY THIS EXISTS. createFixtureListing posts `submit: true`, and a landlord
  submit deliberately NEVER publishes — landlordListingBody sets
  listing_status='disabled' with flags.listing_status='submitted'. Only
  /api/admin/listing-go-live grants 'active', and it requires an ID-verified
  landlord plus a completed video-call property_verifications row.

  bookingService rejects any listing whose listing_status is 'disabled'
  (LISTING_DISABLED). So without this step the booking journeys create a
  listing that CANNOT be booked, and journeys 2-5 fail by construction —
  which is exactly what they did the first time they were ever executed
  (2026-09-10). The suite predates the go-live gate and never caught up.

  WHY A DIRECT WRITE RATHER THAN THE ADMIN ROUTE. Driving the real go-live
  endpoint would need an admin session plus a video-call verification row
  per run — arranging the gate, not testing it. These journeys test BOOKING;
  the gate has its own coverage. So this arranges the end state the gate
  produces, and mirrors its flags exactly so a fixture is indistinguishable
  from an approved listing.

  SAFETY. Refuses anything whose title is not the E2E fixture prefix, so it
  can never promote a real listing — the same guard deleteFixtureListing
  uses, and the reason FIXTURE_TITLE_PREFIX exists rather than an id list.
*/
async function publishFixtureListing(listingId, title) {
  if (!isFixtureTitle(title)) {
    throw new Error(
      `Refusing to publish "${title}" — not an ${FIXTURE_TITLE_PREFIX}fixture.`,
    );
  }
  const service = serviceClient();
  const { data: prev, error: readErr } = await service
    .from('listings')
    .select('flags, title')
    .eq('listing_id', listingId)
    .single();
  if (readErr) throw new Error(`publishFixtureListing read failed: ${readErr.message}`);
  if (!isFixtureTitle(prev?.title)) {
    throw new Error(`Refusing to publish ${listingId} — stored title is not a fixture.`);
  }

  const { error } = await service
    .from('listings')
    .update({
      listing_status: 'active',
      flags: {
        ...(prev.flags || {}),
        disabled: false,
        listing_status: 'live',
        admin_live_approved: true,
        admin_live_by: 'e2e-fixture',
      },
    })
    .eq('listing_id', listingId);
  if (error) throw new Error(`publishFixtureListing failed: ${error.message}`);
}

export async function deleteFixtureListing(landlordToken, listingId) {
  if (!listingId) return;
  assertNotProtectedListing(listingId);

  /*
    Read the listing back and refuse to delete anything that is not ours.

    The id allowlist in fixtures/env.mjs is a hardcoded list and hardcoded
    lists go stale — it previously named four ids that existed in no
    environment, so the guard had been inert for its whole life. This check
    cannot go stale: the suite titles every fixture "E2E …", nobody titles a
    real listing that, and a listing added to prod tomorrow is protected
    automatically.

    It matters here more than it would elsewhere. The only landlord the e2e
    credentials can sign in as is the one that owns the entire live public
    directory, so a teardown that deleted the wrong id would take the site's
    inventory with it.

    A GET that fails is treated as "cannot confirm", and cannot-confirm means
    do not delete. Leaking a fixture is cheap; deleting a real listing is not.
  */
  const check = await apiFetch(`/api/landlord/listings/${listingId}`, {
    token: landlordToken,
  });
  if (check.status === 404) return; // already gone
  if (!check.res.ok) {
    console.warn(
      `[e2e cleanup] refusing to delete ${listingId}: could not read it back `
        + `(${check.status}). Leaving it in place.`,
    );
    return;
  }
  const title = check.data?.listing?.title ?? check.data?.title;
  if (!isFixtureTitle(title)) {
    throw new Error(
      `Refusing to delete listing ${listingId}: title ${JSON.stringify(title)} `
        + `does not start with ${JSON.stringify(FIXTURE_TITLE_PREFIX)}, so it was `
        + 'not created by this suite.',
    );
  }

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

/*
  Clear guest-profile required fields so the booking gate trips.

  This helper already existed and was simply never called in journey 2's
  SETUP — only completeGuestProfile() ran, in afterEach, to leave the account
  usable. So the PROFILE_INCOMPLETE gate could fire exactly once per account,
  ever. The first run that actually executed the journey (2026-09-10) failed
  on that assertion: not wrong, just never run. Call this before asserting
  the gate or the journey is single-use.
*/
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
  /*
    E2E_LOGIN_VIA_UI=1 — sign in through the real form instead of seeding
    localStorage with a session minted over the API.

    This exists as a DISCRIMINATOR for issue #521, where getSession() hangs
    (">8000ms, never settles") and leaves detail pages unable to load. One
    hypothesis is that it is an artifact of this helper rather than a product
    defect: the suite calls signInWithPassword repeatedly across specs, so the
    refresh_token seeded here can already be superseded by the time the
    browser tries to use it, and a refresh against a revoked token may be what
    stalls inside gotrue's lock.

    Signing in through the UI produces a session the browser minted itself,
    with a refresh token nothing else has touched. If the hang disappears
    under this flag, #521 is largely a harness problem; if it persists, it is
    a real defect and the flag has cost nothing to find out.

    Kept rather than deleted after the experiment: it is the slower but more
    faithful path, and a future auth regression is worth being able to test
    both ways without rewriting the helper.
  */
  const role0 = opts.role || 'student';
  if (process.env.E2E_LOGIN_VIA_UI) {
    await loginViaUi(page, {
      email: credentials.email,
      password: credentials.password,
      loginPath:
        role0 === 'landlord'
          ? '/property/thessaloniki/landlord/login'
          : '/student/login',
    });
    return;
  }

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
