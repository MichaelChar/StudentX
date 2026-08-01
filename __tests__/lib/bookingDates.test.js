import { describe, it, expect } from 'vitest';
import {
  parseISODate,
  parseStayRange,
  stayDurationMonths,
  listingCoversStay,
  durationFitsListing,
  costSummary,
  datesOverlap,
} from '@/lib/bookingDates';

describe('bookingDates', () => {
  it('rejects impossible calendar dates', () => {
    expect(parseISODate('2026-02-31')).toBeNull();
    expect(parseISODate('nope')).toBeNull();
    expect(parseISODate('2026-09-01')).toBeInstanceOf(Date);
  });

  it('computes stay duration in months (days/30)', () => {
    // 91 days ≈ 3.0 months
    expect(stayDurationMonths('2026-09-01', '2026-12-01')).toBe(3);
    expect(parseStayRange('2026-09-01', '2026-08-01').error).toMatch(/after/);
  });

  it('checks listing cover window and duration fit', () => {
    const listing = {
      available_from: '2026-09-01',
      available_to: '2027-06-01',
      min_duration_months: 3,
      max_duration_months: 9,
    };
    expect(listingCoversStay(listing, '2026-09-01', '2026-12-01')).toBe(true);
    expect(listingCoversStay(listing, '2026-08-01', '2026-12-01')).toBe(false);
    expect(durationFitsListing(listing, 3)).toBe(true);
    expect(durationFitsListing(listing, 2)).toBe(false);
    expect(durationFitsListing(listing, 10)).toBe(false);
  });

  it('builds offline cost summary', () => {
    const c = costSummary({
      monthlyRent: 450,
      months: 5,
      deposit: 450,
      agencyFee: 100,
    });
    expect(c.total_rent).toBe(2250);
    expect(c.due_at_move_in).toBe(550);
  });

  // Billing is per-day with the monthly price covering 30 days: a 45-day stay
  // is 1.5 months' rent, and a 31-day month costs more than a 28-day one.
  // The display duration is rounded to one decimal; the price must NOT be.
  it('prices from exact days, not the rounded display duration', () => {
    // 145 days = 4.8333… months. Rounded display would undercharge by €15.
    const range = parseStayRange('2026-09-01', '2027-01-24');
    expect(range.months).toBe(4.8);
    expect(range.monthsExact).toBeCloseTo(145 / 30, 10);

    const c = costSummary({
      monthlyRent: 450,
      months: range.months,
      monthsExact: range.monthsExact,
    });
    expect(c.total_rent).toBe(2175); // 450 * 145/30, not 450 * 4.8 = 2160
    expect(c.duration_months).toBe(4.8); // display stays rounded
  });

  it('charges more for a 31-day month than a 28-day one', () => {
    const long = parseStayRange('2026-01-01', '2026-02-01'); // 31 days
    const short = parseStayRange('2026-02-01', '2026-03-01'); // 28 days
    const priceOf = (r) =>
      costSummary({ monthlyRent: 300, months: r.months, monthsExact: r.monthsExact })
        .total_rent;
    expect(priceOf(long)).toBeGreaterThan(priceOf(short));
    expect(priceOf(long)).toBe(310); // 300 * 31/30
    expect(priceOf(short)).toBe(280); // 300 * 28/30
  });

  it('detects inclusive date overlap', () => {
    expect(datesOverlap('2026-01-01', '2026-01-31', '2026-01-15', '2026-02-15')).toBe(
      true,
    );
    expect(datesOverlap('2026-01-01', '2026-01-10', '2026-01-11', '2026-01-20')).toBe(
      false,
    );
  });
});
