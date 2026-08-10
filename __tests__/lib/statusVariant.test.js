import { describe, it, expect } from 'vitest';
import { BOOKING_STATES } from '@/lib/bookingState';
import {
  bookingStateVariant,
  inquiryStatusVariant,
  URGENT_BOOKING_STATES,
} from '@/lib/statusVariant';

describe('bookingStateVariant', () => {
  it('flags disputed as urgent', () => {
    // The regression this module exists for: the landlord reservations page
    // had no `disputed` case, so it fell through to `amenity` — neutral, and
    // indistinguishable from cancelled. A dispute freezes escrow and blocks
    // the payout, and the landlord is the one who has to act on it.
    expect(bookingStateVariant('disputed')).toBe('pending');
  });

  it('flags requested as urgent', () => {
    expect(bookingStateVariant('requested')).toBe('pending');
  });

  it('shows live bookings as in-progress', () => {
    expect(bookingStateVariant('accepted')).toBe('info');
    expect(bookingStateVariant('confirmed')).toBe('info');
    expect(bookingStateVariant('moved_in')).toBe('info');
  });

  it('shows dead bookings as neutral', () => {
    expect(bookingStateVariant('declined')).toBe('amenity');
    expect(bookingStateVariant('expired')).toBe('amenity');
    expect(bookingStateVariant('cancelled')).toBe('amenity');
  });

  it('never renders a disputed booking the same as a cancelled one', () => {
    expect(bookingStateVariant('disputed')).not.toBe(
      bookingStateVariant('cancelled')
    );
  });

  it('covers every state in the machine explicitly', () => {
    // Guards the other half of the original bug: a state added to
    // BOOKING_STATES without a mapping here would silently render neutral.
    const unmapped = BOOKING_STATES.filter(
      (s) => !['pending', 'info', 'amenity'].includes(bookingStateVariant(s))
    );
    expect(unmapped).toEqual([]);
    expect(BOOKING_STATES.length).toBeGreaterThan(0);
  });

  it('falls back to neutral for an unknown state rather than throwing', () => {
    expect(bookingStateVariant('not_a_state')).toBe('amenity');
    expect(bookingStateVariant(undefined)).toBe('amenity');
  });

  it('derives URGENT_BOOKING_STATES from the mapping', () => {
    expect([...URGENT_BOOKING_STATES].sort()).toEqual(['disputed', 'requested']);
  });
});

describe('inquiryStatusVariant', () => {
  it('maps the three inquiry statuses', () => {
    expect(inquiryStatusVariant('pending')).toBe('pending');
    expect(inquiryStatusVariant('replied')).toBe('info');
    expect(inquiryStatusVariant('closed')).toBe('amenity');
  });

  it('falls back to neutral', () => {
    expect(inquiryStatusVariant(undefined)).toBe('amenity');
  });
});
