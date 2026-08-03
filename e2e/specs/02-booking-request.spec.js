import { test, expect } from '@playwright/test';
import {
  hasBookingAuth,
  landlordCredentials,
  studentCredentials,
} from '../fixtures/env.mjs';
import {
  cleanupFixture,
  clearGuestProfile,
  completeGuestProfile,
  createBookingRequest,
  createFixtureListing,
  establishBrowserSession,
  signInWithPassword,
} from '../helpers/api.mjs';
import { futureStayWindow } from '../helpers/dates.mjs';

/**
 * Journey 2 — Booking request + guest-profile gate.
 * Incomplete profile → PROFILE_INCOMPLETE (API) + inline form (UI);
 * complete → successful submit.
 */
test.describe('Booking request + profile gate', () => {
  /** @type {{ landlordToken?: string, studentToken?: string, listingId?: string, bookingId?: string }} */
  const ctx = {};

  test.beforeAll(async () => {
    test.skip(
      !hasBookingAuth(),
      'Set E2E_STUDENT_EMAIL/PASSWORD and E2E_LANDLORD_EMAIL/PASSWORD',
    );
  });

  test.afterEach(async () => {
    if (!ctx.landlordToken && !ctx.studentToken) return;
    await cleanupFixture({
      landlordToken: ctx.landlordToken,
      studentToken: ctx.studentToken,
      listingId: ctx.listingId,
      bookingId: ctx.bookingId,
    });
    if (ctx.studentToken) {
      try {
        await completeGuestProfile(ctx.studentToken);
      } catch (err) {
        console.warn('[e2e] restore guest profile failed:', err.message);
      }
    }
    ctx.listingId = undefined;
    ctx.bookingId = undefined;
  });

  test('PROFILE_INCOMPLETE gate then successful request', async ({ page }) => {
    const student = studentCredentials();
    const landlord = landlordCredentials();

    const landlordSession = await signInWithPassword(
      landlord.email,
      landlord.password,
    );
    ctx.landlordToken = landlordSession.accessToken;

    const studentSession = await signInWithPassword(student.email, student.password);
    ctx.studentToken = studentSession.accessToken;

    const fixture = await createFixtureListing(ctx.landlordToken, {
      runId: `booking-req-${Date.now()}`,
    });
    ctx.listingId = fixture.listingId;

    const { moveIn, moveOut } = futureStayWindow();

    // --- API: incomplete profile is hard-gated with PROFILE_INCOMPLETE ---
    await clearGuestProfile(ctx.studentToken);
    const blocked = await createBookingRequest(ctx.studentToken, {
      listingId: ctx.listingId,
      moveIn,
      moveOut,
    });
    expect(blocked.status).toBe(400);
    expect(blocked.data.error_code).toBe('PROFILE_INCOMPLETE');
    expect(Array.isArray(blocked.data.missing_fields)).toBe(true);
    expect(blocked.data.missing_fields.length).toBeGreaterThan(0);

    // --- UI: listing shows inline guest-profile form; CTA disabled ---
    await establishBrowserSession(page, student, { role: 'student' });
    await page.goto(`/property/thessaloniki/listing/${ctx.listingId}`);
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });

    const widget = page.locator('aside').first();
    await expect(widget.getByText(/Your guest profile/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      widget.getByRole('button', { name: /Request to book/i }),
    ).toBeDisabled();

    // --- Complete profile, then submit successfully ---
    await completeGuestProfile(ctx.studentToken);
    await page.reload();
    await expect(page.locator('h1').first()).toBeVisible();

    const widget2 = page.locator('aside').first();
    // Gate copy should be gone once profile is complete.
    await expect(widget2.getByText(/Your guest profile/i)).toHaveCount(0, {
      timeout: 15_000,
    });

    await widget2.locator('input[type="date"]').first().fill(moveIn);
    await widget2.locator('input[type="date"]').nth(1).fill(moveOut);
    await widget2
      .locator('textarea')
      .fill('I would like to book this studio for the winter semester stay.');

    const bookingRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/bookings') &&
        r.request().method() === 'POST',
    );
    await widget2.getByRole('button', { name: /Request to book/i }).click();
    const bookingResp = await bookingRespPromise;
    const bookingBody = await bookingResp.json().catch(() => ({}));

    expect(bookingResp.status()).toBe(201);
    expect(bookingBody.booking?.booking_id).toBeTruthy();
    ctx.bookingId = bookingBody.booking.booking_id;

    // Widget either shows success or navigates to the inquiry thread.
    await page.waitForTimeout(800);
    const onInquiry = page.url().includes('/student/inquiries/');
    if (!onInquiry) {
      await expect(
        page.getByText(/Request sent|sent to the landlord|success/i).first(),
      ).toBeVisible({ timeout: 15_000 });
    }
  });
});
