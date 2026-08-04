import { test, expect } from '@playwright/test';
import { futureStayWindow } from '../helpers/dates.mjs';

/**
 * Journey 1 — Student discovery (public, no credentials required).
 * Browse results, filter by move-in/out, open a listing, assert marketplace
 * surfaces: availability calendar, cost summary, cancellation policy, similar.
 */
test.describe('Student discovery', () => {
  test('browse results, filter by dates, open listing marketplace blocks', async ({
    page,
  }) => {
    const { moveIn, moveOut } = futureStayWindow();

    await page.goto('/property/thessaloniki/results');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });

    // Date filters on the refine panel (aria-labels from en.json moveIn / moveOut).
    const moveInInput = page.locator('input[type="date"][aria-label="Move-in"], input[type="date"]').first();
    const moveOutInput = page.locator('input[type="date"]').nth(1);

    await moveInInput.fill(moveIn);
    await moveOutInput.fill(moveOut);

    // Wait for filtered fetch to settle (loader gone or cards present).
    await page.waitForTimeout(800);
    await expect(
      page.locator('a[href*="/property/thessaloniki/listing/"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    const firstCard = page.locator('a[href*="/property/thessaloniki/listing/"]').first();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/\/property\/thessaloniki\/listing\//);

    await firstCard.click();
    await expect(page).toHaveURL(/\/property\/thessaloniki\/listing\//);

    // Listing title
    await expect(page.locator('h1').first()).toBeVisible();

    // Booking widget: cost summary appears after dates (fill widget dates).
    const widget = page.locator('aside').first();
    await expect(widget.getByText(/Request to book|€/i).first()).toBeVisible();

    const widgetMoveIn = widget.locator('input[type="date"]').first();
    const widgetMoveOut = widget.locator('input[type="date"]').nth(1);
    await widgetMoveIn.fill(moveIn);
    await widgetMoveOut.fill(moveOut);

    await expect(widget.getByText(/Cost summary/i)).toBeVisible();
    await expect(widget.getByText(/Cancellation policy/i)).toBeVisible();
    await expect(widget.getByText(/Free cancellation/i)).toBeVisible();

    // Availability calendar
    await expect(page.getByText(/Availability/i).first()).toBeVisible();
    await expect(page.getByText(/Available|Pending|Booked/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // Similar listings rail (may be empty when inventory is tiny — soft assert).
    const similar = page.getByText(/Similar listings/i);
    if (await similar.count()) {
      await expect(similar.first()).toBeVisible();
    }
  });
});
