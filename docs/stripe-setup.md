# Stripe Setup — 3-Tier Pricing

After running migrations `010_three_tier_pricing.sql` and `011_stripe_overage_tracking.sql`, create the following Products and Prices in the Stripe Dashboard (or via `stripe` CLI), then update the `subscription_plans` table with the resulting IDs.

## Products to Create

### 1. Pro — €49/year

1. Go to **Products → Add product**
2. Name: `Pro`
3. Add a price:
   - Model: **Standard**
   - Price: `€49.00`
   - Billing period: **Yearly**
   - Currency: EUR
4. Copy the **Price ID** (e.g., `price_xxx`)
5. Update DB:
   ```sql
   UPDATE subscription_plans
   SET stripe_annual_price_id = 'price_xxx'
   WHERE plan_id = 'pro';
   ```

### 2. Super Pro — €99/year (base) + €5/month overage

Super Pro uses two Stripe prices on the same product:

#### Annual base subscription
1. **Products → Add product**, Name: `Super Pro`
2. Add a price:
   - Model: **Standard**
   - Price: `€99.00`
   - Billing period: **Yearly**
   - Currency: EUR
3. Copy the Price ID and update DB:
   ```sql
   UPDATE subscription_plans
   SET stripe_annual_price_id = 'price_yyy'
   WHERE plan_id = 'super_pro';
   ```

#### Overage (metered) — €5/listing/month
On the **same Super Pro product**, add a second price:
- Model: **Usage-based (metered)**
- Unit amount: `€5.00`
- Billing period: **Monthly**
- Aggregation: **Most recent value** (we use `action: 'set'` to report the current overage count)
- Currency: EUR

Copy this Price ID and update DB:
```sql
UPDATE subscription_plans
SET stripe_overage_price_id = 'price_zzz'
WHERE plan_id = 'super_pro';
```

This price ID is used at checkout (added as a second line item) and the resulting subscription item ID is stored in `subscriptions.stripe_overage_item_id` via the `checkout.session.completed` webhook.

## Webhook Configuration

Enable the following events in **Developers → Webhooks**:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.upcoming`

Set endpoint to: `https://<your-domain>/api/webhooks/stripe`

Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in your `.env.local`.

## Environment Variables

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

## How Overage Billing Works

1. **Checkout**: Super Pro checkout includes two line items — the annual base price + the metered overage price.
2. **Subscription created**: The webhook stores `stripe_overage_item_id` from the metered subscription item.
3. **Listing created/deleted**: The listings API calls `reportOverageUsage()` which reports `max(0, count - 20)` to Stripe using `action: 'set'`.
4. **Invoice upcoming**: Stripe fires `invoice.upcoming` 3 days before billing — the webhook syncs the current overage count to ensure accurate charges.
