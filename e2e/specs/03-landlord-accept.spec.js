import { test, expect } from '@playwright/test';
import {
  hasBookingAuth,
  landlordCredentials,
  studentCredentials,
  studentEmailForPrivacyCheck,
} from '../fixtures/env.mjs';
import {
  cleanupFixture,
  completeGuestProfile,
  createBookingRequest,
  createFixtureListing,
  establishBrowserSession,
  signInWithPassword,
} from '../helpers/api.mjs';
import { futureStayWindow } from '../helpers/dates.mjs';

/**
 * Journey 3 — Landlord accepts a request.
 * Guest profile renders; student email must not appear anywhere on the page.
 */
test.describe('Landlord accept', () => {
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

  test('reservation detail shows guest profile without email, then accept', async ({
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
      runId: `ll-accept-${Date.now()}`,
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

    await establishBrowserSession(page, landlord, { role: 'landlord' });

    await page.goto('/property/thessaloniki/landlord/reservations');
    await expect(page.getByText(/Reservations|Pending|Requested/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Open the detail for our booking.
    const detailLink = page.locator(
      `a[href*="/landlord/reservations/${ctx.bookingId}"]`,
    );
    if (await detailLink.count()) {
      await detailLink.first().click();
    } else {
      // Fallback: navigate directly.
      await page.goto(
        `/property/thessaloniki/landlord/reservations/${ctx.bookingId}`,
      );
    }

    await expect(page).toHaveURL(new RegExp(`/reservations/${ctx.bookingId}`));

    // Guest profile block (monogram + display fields — not email).
    await expect(page.getByText(/Guest profile|About the guest/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // Privacy: student email must not appear in the rendered page.
    const email = studentEmailForPrivacyCheck();
    if (email) {
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.toLowerCase()).not.toContain(email.toLowerCase());
      // Also scan full HTML for the address.
      const html = await page.content();
      expect(html.toLowerCase()).not.toContain(email.toLowerCase());
    }

    // Accept
    const acceptBtn = page.getByRole('button', { name: /^Accept$/i });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    await expect(
      page.getByText(/Confirmed|Accepted|confirmed/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
