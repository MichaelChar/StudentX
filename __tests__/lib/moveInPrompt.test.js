import { describe, it, expect } from 'vitest';
import { isEligibleForMoveInPrompt } from '@/lib/bookingState';

/**
 * Pure eligibility for the move-in-prompt cron job.
 * Full job wiring is covered by registry tests; this pins the rule:
 * only confirmed + move-in on or before today.
 */
describe('move-in-prompt eligibility (cron rule)', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  it('allows confirmed bookings on/after move-in', () => {
    expect(
      isEligibleForMoveInPrompt(
        {
          state: 'confirmed',
          move_in: '2026-10-01',
          booking_id: 'b1',
        },
        now,
      ),
    ).toBe(true);
    expect(
      isEligibleForMoveInPrompt(
        {
          state: 'confirmed',
          move_in: '2026-09-15',
          booking_id: 'b2',
        },
        now,
      ),
    ).toBe(true);
  });

  it('rejects confirmed bookings before move-in', () => {
    expect(
      isEligibleForMoveInPrompt(
        {
          state: 'confirmed',
          move_in: '2026-10-02',
          booking_id: 'b3',
        },
        now,
      ),
    ).toBe(false);
  });

  it('rejects non-confirmed states even when move-in has passed', () => {
    for (const state of [
      'requested',
      'accepted',
      'declined',
      'cancelled',
      'expired',
      'disputed',
    ]) {
      expect(
        isEligibleForMoveInPrompt(
          { state, move_in: '2026-09-01', booking_id: `b-${state}` },
          now,
        ),
      ).toBe(false);
    }
  });
});
