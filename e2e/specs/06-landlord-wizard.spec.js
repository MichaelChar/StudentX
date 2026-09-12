import { test, expect } from '@playwright/test';
import {
  hasLandlordAuth,
  landlordCredentials,
} from '../fixtures/env.mjs';
import {
  cleanupFixture,
  establishBrowserSession,
  signInWithPassword,
} from '../helpers/api.mjs';

/**
 * Journey 6 — Landlord listing wizard (7 steps).
 * Assert map pin sets coords (not typeable), the universities step is
 * read-only and measured from that pin, and <5 photos blocks final submit.
 *
 * Does not publish a listing unless a draft is auto-created; any draft
 * created mid-wizard is deleted in afterEach.
 */
test.describe('Landlord listing wizard', () => {
  /** @type {{ landlordToken?: string, listingId?: string }} */
  const ctx = {};

  test.beforeAll(async () => {
    test.skip(!hasLandlordAuth(), 'Set E2E_LANDLORD_EMAIL and E2E_LANDLORD_PASSWORD');
  });

  test.afterEach(async () => {
    // Wizard draft-saves after the property step — delete if we captured an id.
    if (ctx.landlordToken && ctx.listingId) {
      await cleanupFixture({
        landlordToken: ctx.landlordToken,
        listingId: ctx.listingId,
      });
    }
    // Also try to catch draft ids from network if not stored.
    ctx.listingId = undefined;
  });

  test('7 steps; coords from map; universities read-only; photos gate', async ({
    page,
  }) => {
    const landlord = landlordCredentials();
    const session = await signInWithPassword(landlord.email, landlord.password);
    ctx.landlordToken = session.accessToken;
    await establishBrowserSession(page, landlord, { role: 'landlord' });

    // Stub the pin->distance API so Step 3's prefill assertions are
    // deterministic and don't depend on the live OSRM call.
    const STUB_UNIVERSITY_DISTANCES = [
      { university_id: 'auth', distance_meters: 800 },
      { university_id: 'uom', distance_meters: 1500 },
      { university_id: 'ihu', distance_meters: 4200 },
    ];
    await page.route(
      '**/api/landlord/compute-university-distances',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ distances: STUB_UNIVERSITY_DISTANCES }),
        });
      },
    );

    // Capture draft listing ids created during the wizard for cleanup.
    page.on('response', async (res) => {
      try {
        if (
          res.request().method() === 'POST' &&
          res.url().includes('/api/landlord/listings') &&
          !res.url().includes('/duplicate')
        ) {
          const data = await res.json().catch(() => null);
          if (data?.listing_id) ctx.listingId = data.listing_id;
        }
      } catch {
        // ignore
      }
    });

    await page.goto('/property/thessaloniki/landlord/listings/new');

    /*
      The wizard is EIGHT steps now, not seven. ListingForm builds
      `STEPS = includeImport ? ['import', ...MAIN_STEPS] : MAIN_STEPS`, and
      the import step ("Start from a description") sits at the FRONT — so
      every subsequent number shifted by one as well as the total changing.
      This test asserted "Step 1 of 7" and failed on the first run that ever
      executed it (2026-09-10).

      Absolute step numbers are brittle for exactly this reason; they are
      kept because the numbering IS part of what this journey checks (the
      progress indicator), but a step added or removed will break them again
      by design rather than by accident.
    */
    await expect(page.getByText(/Step 1 of 8/i).first()).toBeVisible({ timeout: 30_000 });
    // Skip the paste-a-description step to reach Address.
    await page.getByRole('button', { name: /Start from scratch/i }).click();
    // Address — what used to be step 1, now step 2 behind the import step.
    await expect(page.getByText(/Step 2 of 8/i).first()).toBeVisible({ timeout: 15_000 });

    // --- Step 1: Address — coords not typeable ---
    expect(await page.locator('input[name="lat"], input#lat').count()).toBe(0);
    expect(await page.locator('input[name="lng"], input#lng').count()).toBe(0);

    await page.locator('#wiz-title').fill(`E2E wizard ${Date.now()}`);
    await page.locator('#wiz-address').fill('Egnatia 50');
    await page.locator('#wiz-neighborhood').selectOption({ label: 'Kentro' }).catch(async () => {
      // Neighborhood list is dynamic — pick the first non-empty option.
      const opts = page.locator('#wiz-neighborhood option');
      const count = await opts.count();
      for (let i = 0; i < count; i += 1) {
        const val = await opts.nth(i).getAttribute('value');
        if (val) {
          await page.locator('#wiz-neighborhood').selectOption(val);
          break;
        }
      }
    });

    /*
      Place the pin by clicking the map.

      AddressMap's DraggableMarker registers useMapEvents({ click }), so a
      plain map click does set coords — the approach was right. What was
      wrong is HOW the click was issued: `page.mouse.click(box.x + …)` uses
      VIEWPORT coordinates, and `toBeVisible()` does not mean "in viewport"
      — only that the element has a box and isn't hidden. On the address
      step the map sits below the fold, so the click landed somewhere else
      entirely and no pin was ever set.

      `locator.click({ position })` is relative to the element and scrolls
      it into view first, which is the whole difference.
    */
    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    await map.scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    expect(box).toBeTruthy();
    await map.click({
      position: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) },
    });

    await expect(page.getByText(/Pin set/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 2: Property ---
    await expect(page.getByText(/Step 3 of 8/i).first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#wiz-type').selectOption({ label: 'Studio' }).catch(async () => {
      await page.locator('#wiz-type').selectOption({ index: 1 });
    });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 3: Universities — measured from the pin, nothing to fill in ---
    await expect(page.getByText(/Step 4 of 8/i).first()).toBeVisible({ timeout: 20_000 });

    // Every university in the city is listed, nearest first, with the metres
    // the pin API returned. The step used to be a row builder the landlord had
    // to populate by hand ("+ Add university", typed metres, Computed/Yours
    // provenance pills); it is now read-only and the pin is the only input.
    const uniRows = page.locator('#university-distance-rows > li');
    await expect(uniRows).toHaveCount(STUB_UNIVERSITY_DISTANCES.length, {
      timeout: 20_000,
    });
    // Rendered through formatDistance: metres under 1 km, km above it.
    await expect(uniRows.nth(0)).toContainText('800 m');
    await expect(uniRows.nth(1)).toContainText('1.5 km');
    await expect(uniRows.nth(2)).toContainText('4.2 km');
    await expect(page.locator('#university-distance-rows input')).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: /Prefill from pin|\+ Add university|Remove this university/i,
      }),
    ).toHaveCount(0);
    await expect(page.getByText(/check the location pin/i).first()).toBeVisible();

    // Continue with zero landlord input — the step must never gate on typing.
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 4: Price ---
    await expect(page.getByText(/Step 5 of 8/i).first()).toBeVisible({ timeout: 15_000 });
    const price = page.locator('input[type="number"]').first();
    if (await price.count()) await price.fill('450');
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 5: Availability ---
    await expect(page.getByText(/Step 6 of 8/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 6: Photos (soft continue with zero) ---
    await expect(page.getByText(/Step 7 of 8/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 7: Review — <5 photos blocks submit ---
    await expect(page.getByText(/Step 8 of 8/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Submit|Publish|Create/i }).click();
    await expect(
      // `.first()` for the same reason as the universities gate above: the
      // requirement appears as both an inline hint and a validation error.
      page.getByText(/Add at least 5 photos before submitting|at least 5 photos/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
