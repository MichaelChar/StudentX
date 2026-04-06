/**
 * Derives computed metrics from raw Stripe + Supabase data.
 */
export function computeMetrics(stripeMetrics, supabaseMetrics) {
  const { mrrCents, arrCents, activeSubscriptionCount, trialingCount, cancelledThisMonthCount } = stripeMetrics;
  const { totalLandlords, paidLandlords, freeLandlords, byPlan, totalListings, featuredListings, inquiriesThisMonth, inquiriesLastMonth } = supabaseMetrics;

  // Free-to-paid conversion rate
  const conversionRate = totalLandlords > 0
    ? Math.round((paidLandlords / totalLandlords) * 1000) / 10
    : 0;

  // ARPU = MRR / active paid landlords
  const arpu = paidLandlords > 0
    ? Math.round(mrrCents / paidLandlords)
    : 0;

  // Monthly churn rate = cancelled this month / active at start of month
  // Approximation: active + cancelled_this_month ≈ start-of-month active
  const activeAtMonthStart = activeSubscriptionCount + cancelledThisMonthCount;
  const churnRate = activeAtMonthStart > 0
    ? Math.round((cancelledThisMonthCount / activeAtMonthStart) * 1000) / 10
    : 0;

  // Inquiry trend
  const inquiryTrend = inquiriesLastMonth > 0
    ? Math.round(((inquiriesThisMonth - inquiriesLastMonth) / inquiriesLastMonth) * 1000) / 10
    : null;

  return {
    mrr: mrrCents,
    arr: arrCents,
    mrrFormatted: formatCents(mrrCents),
    arrFormatted: formatCents(arrCents),
    arpuCents: arpu,
    arpuFormatted: formatCents(arpu),
    totalLandlords,
    paidLandlords,
    freeLandlords,
    trialingCount,
    conversionRate,
    churnRate,
    cancelledThisMonth: cancelledThisMonthCount,
    byPlan,
    totalListings,
    featuredListings,
    inquiriesThisMonth,
    inquiriesLastMonth,
    inquiryTrend,
    cac: null, // placeholder until acquisition tracking exists
  };
}

function formatCents(cents) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
