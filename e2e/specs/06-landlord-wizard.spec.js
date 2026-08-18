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
 * Assert map pin sets coords (not typeable), <2 university distances blocks,
 * <5 photos blocks final submit.
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

  test('7 steps; coords from map; universities and photos gates', async ({
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
    await expect(page.getByText(/Step 1 of 7/i)).toBeVisible({ timeout: 30_000 });

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

    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    const box = await map.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByText(/Pin set/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 2: Property ---
    await expect(page.getByText(/Step 2 of 7/i)).toBeVisible({ timeout: 15_000 });
    await page.locator('#wiz-type').selectOption({ label: 'Studio' }).catch(async () => {
      await page.locator('#wiz-type').selectOption({ index: 1 });
    });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 3: Universities — empty rows must block ---
    await expect(page.getByText(/Step 3 of 7/i)).toBeVisible({ timeout: 20_000 });
    // Wait for auto-prefill attempt, then strip rows down to exactly one so
    // the "+ Add university" regression assertions below start from a known
    // state.
    await page.waitForTimeout(2000);
    for (let i = 0; i < 6; i += 1) {
      const remove = page.getByRole('button', { name: /Remove/i });
      if ((await remove.count()) <= 1) break;
      await remove.first().click();
      await page.waitForTimeout(150);
    }
    const uniRows = page.locator('#university-distance-rows > div');
    await expect(uniRows).toHaveCount(1);

    // --- Regression (PR #381): "+ Add university" must add exactly ONE
    // row, the new row must get its distance from the map pin (it used to
    // stay an empty landlord shell), and typing over an existing row must
    // survive a later "Prefill from pin" click.
    const uniRowSelects = page.locator('#university-distance-rows select');
    const prefillButton = page.getByRole('button', { name: 'Prefill from pin' });

    // 1. "+ Add university" adds exactly one row (bug: it used to add every
    // remaining university in one click).
    const rowCountBeforeAdd = await uniRowSelects.count();
    await page.getByRole('button', { name: '+ Add university' }).click();
    // Add computes the new row's distance via the same prefill call as the
    // button above, so wait for prefillLoading to clear before counting.
    await expect(prefillButton).toBeEnabled({ timeout: 15_000 });
    await expect(uniRowSelects).toHaveCount(rowCountBeforeAdd + 1);

    // 2. The new row already has a non-empty distance from the pin and is
    // marked "Computed" (bug: it stayed an empty "Yours" shell).
    const addedRow = uniRows.last();
    const addedRowDistance = addedRow.locator(
      'input[type="number"][aria-label]',
    );
    await expect(addedRowDistance).not.toHaveValue('');
    await expect(addedRow.getByText('Computed', { exact: true })).toBeVisible();

    // 3. Typing into the first row flips its pill to "Yours"; a later
    // Prefill from pin must not clobber that landlord-entered value.
    const firstRow = uniRows.first();
    const firstRowDistance = firstRow.locator(
      'input[type="number"][aria-label]',
    );
    await firstRowDistance.fill('1234');
    await expect(firstRow.getByText('Yours', { exact: true })).toBeVisible();
    await prefillButton.click();
    await expect(prefillButton).toBeEnabled({ timeout: 15_000 });
    await expect(firstRowDistance).toHaveValue('1234');
    await expect(firstRow.getByText('Yours', { exact: true })).toBeVisible();

    // Ensure no filled distances remain, to test the <2-universities gate.
    const distInputs = page.locator('input[type="number"][aria-label]');
    const n = await distInputs.count();
    for (let i = 0; i < n; i += 1) {
      await distInputs.nth(i).fill('');
    }

    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(
      page.getByText(/Add distances for at least 2 universities|at least 2/i),
    ).toBeVisible({ timeout: 10_000 });

    // Recover with two distances via prefill or manual add.
    const prefill = page.getByRole('button', { name: /Prefill|prefill/i });
    if (await prefill.count()) {
      await prefill.first().click();
      await page.waitForTimeout(2500);
    }
    let filled = 0;
    const after = page.locator('input[type="number"][aria-label]');
    const afterCount = await after.count();
    for (let i = 0; i < afterCount; i += 1) {
      const v = await after.nth(i).inputValue();
      if (v && Number(v) > 0) filled += 1;
      else {
        await after.nth(i).fill(String(1500 + i * 100));
        filled += 1;
      }
    }
    if (filled < 2) {
      const add = page.getByRole('button', { name: /Add/i });
      while ((await after.count()) < 2 && (await add.count())) {
        await add.first().click();
      }
      const again = page.locator('input[type="number"][aria-label]');
      for (let i = 0; i < Math.min(2, await again.count()); i += 1) {
        await again.nth(i).fill(String(1600 + i * 200));
      }
    }

    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 4: Price ---
    await expect(page.getByText(/Step 4 of 7/i)).toBeVisible({ timeout: 15_000 });
    const price = page.locator('input[type="number"]').first();
    if (await price.count()) await price.fill('450');
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 5: Availability ---
    await expect(page.getByText(/Step 5 of 7/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 6: Photos (soft continue with zero) ---
    await expect(page.getByText(/Step 6 of 7/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // --- Step 7: Review — <5 photos blocks submit ---
    await expect(page.getByText(/Step 7 of 7/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Submit|Publish|Create/i }).click();
    await expect(
      page.getByText(/Add at least 5 photos before submitting|at least 5 photos/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
