import { describe, it, expect } from 'vitest';
import { computeMetrics } from '@/lib/metrics/compute';

const stripeBase = {
  mrrCents: 50_000,
  arrCents: 600_000,
  activeSubscriptionCount: 10,
  trialingCount: 2,
  cancelledThisMonthCount: 1,
};

const supabaseBase = {
  totalLandlords: 50,
  paidLandlords: 10,
  freeLandlords: 40,
  byPlan: { basic: 6, pro: 4 },
  totalListings: 120,
  featuredListings: 8,
  inquiriesThisMonth: 60,
  inquiriesLastMonth: 50,
};

describe('computeMetrics', () => {
  it('computes happy-path conversion, ARPU, churn, and inquiry trend', () => {
    const out = computeMetrics(stripeBase, supabaseBase);
    expect(out.conversionRate).toBe(20); // 10/50 = 20%
    expect(out.arpuCents).toBe(5000); // 50000 / 10
    // active-at-month-start = 10 + 1 = 11; churn = 1/11 ≈ 9.1%
    expect(out.churnRate).toBe(9.1);
    // (60 - 50) / 50 = 20%
    expect(out.inquiryTrend).toBe(20);
  });

  it('passes through plan and listing counts unchanged', () => {
    const out = computeMetrics(stripeBase, supabaseBase);
    expect(out.byPlan).toEqual({ basic: 6, pro: 4 });
    expect(out.totalListings).toBe(120);
    expect(out.featuredListings).toBe(8);
    expect(out.trialingCount).toBe(2);
    expect(out.cancelledThisMonth).toBe(1);
    expect(out.cac).toBeNull();
  });

  it('formats MRR/ARR/ARPU as EUR with no fractional units', () => {
    const out = computeMetrics(stripeBase, supabaseBase);
    expect(out.mrrFormatted).toMatch(/€500/);
    expect(out.arrFormatted).toMatch(/€6,000/);
    expect(out.arpuFormatted).toMatch(/€50/);
  });

  it('returns 0 conversion / 0 ARPU when there are no landlords or no paid landlords', () => {
    const out = computeMetrics(
      { ...stripeBase, mrrCents: 0 },
      { ...supabaseBase, totalLandlords: 0, paidLandlords: 0, freeLandlords: 0 }
    );
    expect(out.conversionRate).toBe(0);
    expect(out.arpuCents).toBe(0);
  });

  it('returns 0 churn when no subs were ever active', () => {
    const out = computeMetrics(
      { ...stripeBase, activeSubscriptionCount: 0, cancelledThisMonthCount: 0 },
      supabaseBase
    );
    expect(out.churnRate).toBe(0);
  });

  it('returns null inquiry trend when last month had zero inquiries (avoids div-by-zero)', () => {
    const out = computeMetrics(stripeBase, { ...supabaseBase, inquiriesLastMonth: 0 });
    expect(out.inquiryTrend).toBeNull();
  });

  it('returns a negative trend when inquiries dropped month-over-month', () => {
    const out = computeMetrics(stripeBase, {
      ...supabaseBase,
      inquiriesThisMonth: 40,
      inquiriesLastMonth: 50,
    });
    expect(out.inquiryTrend).toBe(-20);
  });
});
