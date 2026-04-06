import { getStripe } from '@/lib/stripe';

/**
 * Fetch all active subscriptions from Stripe and compute MRR/ARR.
 */
export async function getStripeMetrics() {
  const stripe = getStripe();

  // Fetch all active subscriptions (paginate if needed)
  const subscriptions = [];
  let hasMore = true;
  let startingAfter = undefined;

  while (hasMore) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ['data.items.data.price'],
    });
    subscriptions.push(...page.data);
    hasMore = page.has_more;
    if (hasMore) startingAfter = page.data[page.data.length - 1].id;
  }

  // Also include trialing and past_due for MRR count
  const allPaidStatuses = ['active', 'trialing', 'past_due'];
  const allSubs = [];
  for (const status of allPaidStatuses) {
    let more = true;
    let after = undefined;
    while (more) {
      const page = await stripe.subscriptions.list({
        status,
        limit: 100,
        ...(after ? { starting_after: after } : {}),
        expand: ['data.items.data.price'],
      });
      allSubs.push(...page.data);
      more = page.has_more;
      if (more) after = page.data[page.data.length - 1].id;
    }
  }

  // Deduplicate by subscription id
  const subMap = new Map();
  for (const s of allSubs) subMap.set(s.id, s);
  const uniqueSubs = Array.from(subMap.values());

  // Calculate MRR: sum of monthly-equivalent amounts
  let mrrCents = 0;
  for (const sub of uniqueSubs) {
    for (const item of sub.items.data) {
      const price = item.price;
      const qty = item.quantity || 1;
      if (!price || !price.unit_amount) continue;
      const interval = price.recurring?.interval;
      const intervalCount = price.recurring?.interval_count || 1;
      let monthly = price.unit_amount * qty;
      if (interval === 'year') monthly = (monthly / 12) / intervalCount;
      else if (interval === 'month') monthly = monthly / intervalCount;
      else if (interval === 'week') monthly = (monthly * 52) / 12 / intervalCount;
      mrrCents += monthly;
    }
  }

  // Churn: cancelled in current calendar month
  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const cancelledThisMonth = [];
  let moreChurn = true;
  let afterChurn = undefined;
  while (moreChurn) {
    const page = await stripe.subscriptions.list({
      status: 'canceled',
      limit: 100,
      created: { gte: monthStart },
      ...(afterChurn ? { starting_after: afterChurn } : {}),
    });
    cancelledThisMonth.push(...page.data);
    moreChurn = page.has_more;
    if (moreChurn) afterChurn = page.data[page.data.length - 1].id;
  }

  return {
    mrrCents: Math.round(mrrCents),
    arrCents: Math.round(mrrCents * 12),
    activeSubscriptionCount: uniqueSubs.filter((s) => s.status === 'active').length,
    trialingCount: uniqueSubs.filter((s) => s.status === 'trialing').length,
    cancelledThisMonthCount: cancelledThisMonth.length,
  };
}
