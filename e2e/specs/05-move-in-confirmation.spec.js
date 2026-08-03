import { test, expect } from '@playwright/test';
import {
  hasBookingAuth,
  landlordCredentials,
  studentCredentials,
} from '../fixtures/env.mjs';
import {
  cleanupFixture,
  completeGuestProfile,
  createBookingRequest,
  createFixtureListing,
  establishBrowserSession,
  patchBooking,
  signInWithPassword,
} from '../helpers/api.mjs';
import { pastMoveInStayWindow } from '../helpers/dates.mjs';

/**
 * Journey 5 — Move-in confirmation prompt after move-in date has passed.
 * Setup uses past move_in dates (API allows); accept → confirmed → student UI.
 */
test.describe('Move-in confirmation', () => {
  /** @type {{ landlordToken?: string, studentToken?: string, listingId?: string, bookingId?: string }} */
  const ctx = {};

  test.beforeAll(async () => {
    test.skip(
      !hasBookingAuth(),
      'Set E2E_STUDENT_EMAIL/PASSWORD and E2E_LANDLORD_EMAIL/PASSWORD',
    );
  });

  test.afterEach(async () => {
    await cleanupFixture({
      landlordToken: ctx.landlordToken,
      studentToken: ctx.studentToken,
      listingId: ctx.listingId,
      bookingId: ctx.bookingId,
    });
    ctx.listingId = undefined;
    ctx.bookingId = undefined;
  });

  test('student sees move-in prompt and confirms to moved_in', async ({ page }) => {
    const student = studentCredentials();
    const landlord = landlordCredentials();

    const landlordSession = await signInWithPassword(
      landlord.email,
      landlord.password,
    );
    ctx.landlordToken = landlordSession.accessToken;

    const studentSession = await signInWithPassword(student.email, student.password);
    ctx.studentToken = studentSession.accessToken;
    await completeGuestProfile(ctx.studentToken);

    // Listing window must cover the past move-in.
    const fixture = await createFixtureListing(ctx.landlordToken, {
      runId: `move-in-${Date.now()}`,
      availableFrom: '2024-01-01',
      minDuration: 1,
    });
    ctx.listingId = fixture.listingId;

    const { moveIn, moveOut } = pastMoveInStayWindow();
    const created = await createBookingRequest(ctx.studentToken, {
      listingId: ctx.listingId,
      moveIn,
      moveOut,
      message:
        'E2E move-in confirmation fixture — booking with move-in already in the past.',
    });
    expect(
      created.status,
      `create booking for past move-in failed: ${JSON.stringify(created.data)}`,
    ).toBe(201);
    ctx.bookingId = created.data.booking.booking_id;

    const accepted = await patchBooking(ctx.landlordToken, ctx.bookingId, 'accept');
    expect(
      accepted.status,
      `accept failed: ${JSON.stringify(accepted.data)}`,
    ).toBe(200);
    expect(accepted.data.booking?.state).toBe('confirmed');

    await establishBrowserSession(page, student, { role: 'student' });
    await page.goto(`/student/account/bookings/${ctx.bookingId}`);

    await expect(
      page.getByText(/Is everything as promised\?/i),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /^Confirm$/i }).click();

    await expect(page.getByText(/Moved in|move-in confirmed|as promised/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
