# Stripe Setup — Pricing Plans (Sandbox)

After running migration `012_verified_pricing_pivot.sql`, create the following Products and Prices in the Stripe Dashboard (or via API), then update the `subscription_plans` table with the resulting IDs.

## Pricing Model

| Tier | Annual Price | Max Properties | Overage | Support |
|------|-------------|---------------|---------|---------|
| Landlord Light (Free) | €0 | Unlimited | — | Email |
| SuperLandlord (Verified) | €49/year | 5 | — | Email |
| SuperLandlord Heavy (Verified Pro) | €99/year | 12 | €5/property/month | Priority |

> **Note:** Free-tier inquiries are capped at 10 per listing. Paid tiers have unlimited inquiries.

## Sandbox IDs (Test Mode)

These products and prices have been created in the Stripe test sandbox:

### SuperLandlord (Verified) — €49/year, up to 5 properties

- **Product**: `prod_UITLnKWqtT4sYc`
- **Price (annual)**: `price_1TJsOu2YOWEc8jqDua5lZoSp`

```sql
UPDATE subscription_plans
SET stripe_annual_price_id = 'price_1TJsOu2YOWEc8jqDua5lZoSp'
WHERE plan_id = 'verified';
```

### SuperLandlord Heavy (Verified Pro) — €99/year, up to 12 properties + €5/property/month overage

- **Product**: `prod_UITLRroVg38ra6`
- **Price (annual base)**: `price_1TJsP72YOWEc8jqDwCHEFatr`
- **Overage meter**: `mtr_test_61UTGMtjvzExVehQU412YOWEc8jqDI1Q`
- **Overage price (metered)**: `price_1TJsPd2YOWEc8jqDLJiqpabo`

```sql
UPDATE subscription_plans
SET stripe_annual_price_id = 'price_1TJsP72YOWEc8jqDwCHEFatr',
    stripe_overage_price_id = 'price_1TJsPd2YOWEc8jqDLJiqpabo'
WHERE plan_id = 'verified_pro';
```

## Webhook Configuration

Enable the following events in **Developers > Webhooks**:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.upcoming`

Set endpoint to: `https://<your-domain>/api/webhooks/stripe`

Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in your `.env.local`.

## Environment Variables

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # Production: https://studentx.uk
```

## How Overage Billing Works

1. **Checkout**: Verified Pro checkout includes two line items — the annual base price + the metered overage price.
2. **Subscription created**: The webhook stores `stripe_overage_item_id` from the metered subscription item.
3. **Listing created/deleted**: The listings API reports `max(0, count - 12)` to Stripe via the billing meter (`property_overage` event).
4. **Invoice upcoming**: Stripe fires `invoice.upcoming` 3 days before billing — the webhook syncs the current overage count.
