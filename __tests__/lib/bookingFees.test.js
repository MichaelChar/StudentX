import { describe, it, expect } from 'vitest';
import {
  HOST_COMMISSION_RATE,
  COMMISSION_VAT_RATE,
  hostCommission,
  landlordFirstMonthReceive,
} from '@/lib/bookingFees';
import {
  bookingInquiryIntro,
  composeBookingInquiryMessage,
} from '@/lib/bookingService';

describe('bookingFees', () => {
  it('uses 5% host commission and 24% VAT', () => {
    expect(HOST_COMMISSION_RATE).toBe(0.05);
    expect(COMMISSION_VAT_RATE).toBe(0.24);
  });

  it('computes net, VAT, and gross commission from total stay', () => {
    // €4500 stay → net 225, VAT 54, gross 279
    const r = hostCommission({ totalStayValue: 4500 });
    expect(r.commission_net).toBe(225);
    expect(r.commission_vat).toBe(54);
    expect(r.commission_gross).toBe(279);
  });

  it('you receive = first month rent − commission gross', () => {
    const r = landlordFirstMonthReceive({
      firstMonthRent: 450,
      totalStayValue: 4500,
    });
    expect(r.first_month_rent).toBe(450);
    expect(r.commission_gross).toBe(279);
    expect(r.you_receive).toBe(171);
  });

  it('stays solvent at the 12-month duration cap', () => {
    // Commission is months × 5% × 1.24 = 6.2%/month of the first month.
    // At the schema cap (12 months) that is 74.4% — payout stays positive.
    const r = landlordFirstMonthReceive({
      firstMonthRent: 450,
      totalStayValue: 450 * 12,
    });
    expect(r.commission_gross).toBe(334.8);
    expect(r.you_receive).toBe(115.2);
    expect(r.you_receive).toBeGreaterThan(0);
  });

  it('rounds money to cents', () => {
    const r = hostCommission({ totalStayValue: 1000 });
    // 50 net, 12 VAT, 62 gross
    expect(r.commission_net).toBe(50);
    expect(r.commission_vat).toBe(12);
    expect(r.commission_gross).toBe(62);
  });
});

describe('booking inquiry intro', () => {
  it('prepends template and keeps student message', () => {
    const intro = bookingInquiryIntro({
      landlordName: 'Kostas',
      studentName: 'Ada',
    });
    expect(intro).toContain('Hi Kostas');
    expect(intro).toContain('I am Ada');

    const full = composeBookingInquiryMessage({
      landlordName: 'Kostas',
      studentName: 'Ada',
      studentMessage: 'Looking for a quiet room near AUTH.',
    });
    expect(full.startsWith(intro)).toBe(true);
    expect(full).toContain('Looking for a quiet room near AUTH.');
  });
});
