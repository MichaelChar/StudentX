import { describe, it, expect } from 'vitest';
import {
  VIEWS_WINDOW_DAYS,
  hasWaiting,
  summariseHostNav,
  viewsCutoffDate,
} from '@/lib/hostNavSummary';

describe('summariseHostNav — view count', () => {
  it('sums view_count across rows', () => {
    const s = summariseHostNav({
      viewRows: [{ view_count: 12 }, { view_count: 30 }, { view_count: 1 }],
    });
    expect(s.viewsLast30).toBe(43);
  });

  it('is zero when there is nothing to count', () => {
    expect(summariseHostNav().viewsLast30).toBe(0);
    expect(summariseHostNav({ viewRows: [] }).viewsLast30).toBe(0);
    expect(summariseHostNav({ viewRows: null }).viewsLast30).toBe(0);
  });

  /*
    listing_views is written by a counter, but a null or a negative would make
    the nav render "-3 views" — visible on every landlord page. Skip, don't
    propagate.
  */
  it('ignores null, non-numeric and negative counts', () => {
    const s = summariseHostNav({
      viewRows: [
        { view_count: 5 },
        { view_count: null },
        { view_count: undefined },
        { view_count: '7' },
        { view_count: -4 },
        {},
        null,
      ],
    });
    expect(s.viewsLast30).toBe(5);
  });
});

describe('summariseHostNav — the two pending feeds', () => {
  it('reports presence for each feed independently', () => {
    expect(summariseHostNav({ requestedBookingRows: [{}] })).toMatchObject({
      hasPendingRequests: true,
      hasPendingInquiries: false,
    });
    expect(summariseHostNav({ pendingInquiryRows: [{}] })).toMatchObject({
      hasPendingRequests: false,
      hasPendingInquiries: true,
    });
  });

  it('is false for empty and nullish inputs', () => {
    const s = summariseHostNav({ requestedBookingRows: [], pendingInquiryRows: null });
    expect(s.hasPendingRequests).toBe(false);
    expect(s.hasPendingInquiries).toBe(false);
  });

  /*
    The addendum's whole point: the dot is PRESENCE, not a tally. If a count
    ever escapes this reducer, someone will render it — and a number invites a
    landlord to triage the queue instead of opening it, which is the opposite
    of the behaviour the feature exists to produce.
  */
  it('discards the counts entirely, so no caller can render one', () => {
    const s = summariseHostNav({
      requestedBookingRows: [{}, {}, {}, {}],
      pendingInquiryRows: [{}, {}],
    });
    expect(Object.keys(s).sort()).toEqual([
      'hasPendingInquiries',
      'hasPendingRequests',
      'viewsLast30',
    ]);
    expect(s.hasPendingRequests).toBe(true);
  });
});

describe('hasWaiting', () => {
  it('lights the dot when either feed has something', () => {
    expect(hasWaiting({ hasPendingRequests: true, hasPendingInquiries: false })).toBe(true);
    expect(hasWaiting({ hasPendingRequests: false, hasPendingInquiries: true })).toBe(true);
    expect(hasWaiting({ hasPendingRequests: true, hasPendingInquiries: true })).toBe(true);
  });

  it('stays dark when both are empty', () => {
    expect(hasWaiting({ hasPendingRequests: false, hasPendingInquiries: false })).toBe(false);
    expect(hasWaiting(summariseHostNav())).toBe(false);
  });

  it('survives being handed nothing', () => {
    expect(hasWaiting(undefined)).toBe(false);
    expect(hasWaiting(null)).toBe(false);
  });
});

describe('viewsCutoffDate', () => {
  it('is a bare YYYY-MM-DD, because view_date is a DATE column', () => {
    expect(viewsCutoffDate(new Date('2026-09-03T11:22:33Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('goes back exactly the window', () => {
    expect(viewsCutoffDate(new Date('2026-09-03T00:00:00Z'))).toBe('2026-08-04');
    expect(VIEWS_WINDOW_DAYS).toBe(30);
  });

  it('crosses a month boundary correctly', () => {
    expect(viewsCutoffDate(new Date('2026-03-05T00:00:00Z'))).toBe('2026-02-03');
  });

  /*
    Late-UTC-evening instants are where a naive local-time implementation
    silently slips a day. Both of these sit inside the same UTC date.
  */
  it('does not drift with the time of day', () => {
    expect(viewsCutoffDate(new Date('2026-09-03T23:59:59Z'))).toBe('2026-08-04');
    expect(viewsCutoffDate(new Date('2026-09-03T00:00:01Z'))).toBe('2026-08-04');
  });
});
