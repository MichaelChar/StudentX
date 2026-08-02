import { describe, it, expect } from 'vitest';
import {
  CANCELLATION_TIERS,
  FREE_CANCEL_DAYS,
  HALF_REFUND_DAYS,
  tierForDaysUntilMoveIn,
} from '@/lib/cancellationPolicy';

describe('cancellationPolicy', () => {
  it('encodes free / half / none tiers with the contracted day bounds', () => {
    expect(FREE_CANCEL_DAYS).toBe(60);
    expect(HALF_REFUND_DAYS).toBe(30);
    expect(CANCELLATION_TIERS).toHaveLength(3);
    expect(CANCELLATION_TIERS.map((t) => t.id)).toEqual(['free', 'half', 'none']);
    expect(CANCELLATION_TIERS.map((t) => t.refundPercent)).toEqual([100, 50, 0]);
  });

  it('resolves free when more than 60 days before move-in', () => {
    expect(tierForDaysUntilMoveIn(61).id).toBe('free');
    expect(tierForDaysUntilMoveIn(120).refundPercent).toBe(100);
  });

  it('resolves half refund at 30–60 days inclusive of the lower bound', () => {
    expect(tierForDaysUntilMoveIn(60).id).toBe('half');
    expect(tierForDaysUntilMoveIn(30).id).toBe('half');
    expect(tierForDaysUntilMoveIn(45).refundPercent).toBe(50);
  });

  it('resolves no refund inside 30 days', () => {
    expect(tierForDaysUntilMoveIn(29).id).toBe('none');
    expect(tierForDaysUntilMoveIn(0).refundPercent).toBe(0);
  });

  it('treats invalid input as day-0 (no refund)', () => {
    expect(tierForDaysUntilMoveIn(NaN).id).toBe('none');
    expect(tierForDaysUntilMoveIn(-5).id).toBe('none');
  });
});
