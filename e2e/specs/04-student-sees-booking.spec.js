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
import { futureStayWindow } from '../helpers/dates.mjs';

/**
 * Journey 4 — Student bookings list + detail with inquiry thread link.
 */
test.describe('Student sees booking', () => {
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

  test('bookings list shows confirmed status and detail links to chat', async ({
    page,
  }) => {
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

    const fixture = await createFixtureListing(ctx.landlordToken, {
      runId: `stu-sees-${Date.now()}`,
    });
    ctx.listingId = fixture.listingId;

    const { moveIn, moveOut } = futureStayWindow();
    const created = await createBookingRequest(ctx.studentToken, {
      listingId: ctx.listingId,
      moveIn,
      moveOut,
    });
    expect(created.status).toBe(201);
    ctx.bookingId = created.data.booking.booking_id;

    const accepted = await patchBooking(ctx.landlordToken, ctx.bookingId, 'accept');
    expect(accepted.status).toBe(200);
    expect(accepted.data.booking?.state).toBe('confirmed');

    await establishBrowserSession(page, student, { role: 'student' });

    await page.goto('/student/account/bookings');
    await expect(page.getByText(/Booking|Confirmed|Requested/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Our fixture title or confirmed pill should be present.
    await expect(
      page
        .getByText(/Confirmed/i)
        .or(page.getByText(fixture.title))
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    const detailHref = page.locator(
      `a[href*="/student/account/bookings/${ctx.bookingId}"]`,
    );
    if (await detailHref.count()) {
      await detailHref.first().click();
    } else {
      await page.goto(`/student/account/bookings/${ctx.bookingId}`);
    }

    await expect(page).toHaveURL(new RegExp(`/bookings/${ctx.bookingId}`));
    await expect(page.getByText(/Confirmed/i).first()).toBeVisible();

    // Inquiry thread link
    const thread = page.getByRole('link', { name: /Open chat|chat|inquiry/i });
    await expect(thread.first()).toBeVisible();
    const href = await thread.first().getAttribute('href');
    expect(href).toMatch(/\/student\/inquiries\//);
  });
});
