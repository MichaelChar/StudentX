#!/usr/bin/env node
// scripts/setup_founding_five_coupon.mjs
//
// Creates the FOUNDING_FIVE_80 promotion code in Stripe — 80% off, applies
// to the first invoice only (one-time discount), max 4 redemptions (rank 1
// is the founder/owner; the public-facing offer is for ranks 2–5).
//
// Run with the standard secret key (the restricted key needs explicit
// Coupons + Promotion-codes scopes):
//
//   STRIPE_SECRET_KEY=sk_live_... node scripts/setup_founding_five_coupon.mjs
//
// Idempotent: if the coupon or code already exists with a different
// max_redemptions value, the script deletes them and recreates clean.
//
// API VERSION: pinned to 2024-09-30.acacia. The SDK's Dahlia default
// (2026-04-22) renamed/restructured the `coupon` parameter on
// promotionCodes.create. Pinning avoids the rename until the SDK exposes
// the new shape.

import Stripe from 'stripe';

const COUPON_ID = 'founding_five_80';
const PROMO_CODE = 'FOUNDING_FIVE_80';
const PERCENT_OFF = 80;
const MAX_REDEMPTIONS = 4;
const API_VERSION = '2024-09-30.acacia';

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('Missing STRIPE_SECRET_KEY environment variable.');
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: API_VERSION });

  // 1. Tear down any previous attempt that has the wrong max_redemptions.
  // Coupons are immutable on max_redemptions, so we delete + recreate.
  const existingCodes = await stripe.promotionCodes.list({ code: PROMO_CODE, limit: 1 });
  if (existingCodes.data[0]) {
    const code = existingCodes.data[0];
    if (code.max_redemptions === MAX_REDEMPTIONS && code.times_redeemed === 0) {
      console.log(`Promotion code ${PROMO_CODE} already correct (id: ${code.id}). Nothing to do.`);
      return;
    }
    if (code.times_redeemed > 0) {
      console.error(
        `Promotion code ${PROMO_CODE} has ${code.times_redeemed} redemption(s) — refusing to recreate.`,
      );
      process.exit(1);
    }
    // Promotion codes can be deactivated but not deleted; deactivating is
    // enough since we'll reuse the human-readable code on a new promo.
    // Stripe enforces uniqueness on active codes only.
    await stripe.promotionCodes.update(code.id, { active: false });
    console.log(`Deactivated stale promotion code ${code.id}.`);
  }

  let existingCoupon;
  try {
    existingCoupon = await stripe.coupons.retrieve(COUPON_ID);
  } catch (err) {
    if (err.code !== 'resource_missing') throw err;
  }
  if (existingCoupon) {
    if (existingCoupon.max_redemptions === MAX_REDEMPTIONS && existingCoupon.times_redeemed === 0) {
      console.log(`Coupon ${COUPON_ID} already correct, reusing.`);
    } else if (existingCoupon.times_redeemed > 0) {
      console.error(
        `Coupon ${COUPON_ID} has ${existingCoupon.times_redeemed} redemption(s) — refusing to recreate.`,
      );
      process.exit(1);
    } else {
      await stripe.coupons.del(COUPON_ID);
      console.log(`Deleted stale coupon ${COUPON_ID} (was max_redemptions=${existingCoupon.max_redemptions}).`);
      existingCoupon = null;
    }
  }

  // 2. Coupon (the underlying discount). One-time, first invoice only.
  const coupon =
    existingCoupon ||
    (await stripe.coupons.create({
      id: COUPON_ID,
      name: 'Founding Five — 80% off Year 1',
      percent_off: PERCENT_OFF,
      duration: 'once',
      max_redemptions: MAX_REDEMPTIONS,
      metadata: {
        cohort: 'founding_five',
        offer: 'AUSoM 2026 founding cohort',
      },
    }));
  if (!existingCoupon) console.log(`Created coupon ${coupon.id}.`);

  // 3. Promotion code attached to the coupon
  const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: PROMO_CODE,
    max_redemptions: MAX_REDEMPTIONS,
    metadata: {
      cohort: 'founding_five',
    },
  });

  console.log(`\nCreated promotion code ${promo.code}`);
  console.log(`  id:               ${promo.id}`);
  console.log(`  coupon:           ${coupon.id}`);
  console.log(`  percent_off:      ${PERCENT_OFF}%`);
  console.log(`  duration:         once (first invoice only)`);
  console.log(`  max_redemptions:  ${MAX_REDEMPTIONS}`);
  console.log(`\nPass promoCode: "${PROMO_CODE}" in the checkout body to apply.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
