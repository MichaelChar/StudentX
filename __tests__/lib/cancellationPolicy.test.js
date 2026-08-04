import { describe, it, expect } from 'vitest';
import {
  CANCELLATION_TIERS,
  FREE_CANCEL_DAYS,
  HALF_REFUND_DAYS,
  tierForDaysUntilMoveIn,
} from '@/lib/cancellationPolicy';

describe('cancellationPolicy', () => {
  it('exposes free + half display tiers only', () => {
    expect(CANCELLATION_TIERS).toHaveLength(2);
    expect(CANCELLATION_TIERS.map((t) => t.id)).toEqual(['free', 'half']);
    expect(CANCELLATION_TIERS.map((t) => t.refundPercent)).toEqual([100, 50]);
    expect(FREE_CANCEL_DAYS).toBe(60);
    expect(HALF_REFUND_DAYS).toBe(30);
  });

  it('free when more than 60 days out', () => {
    expect(tierForDaysUntilMoveIn(61).id).toBe('free');
    expect(tierForDaysUntilMoveIn(120).refundPercent).toBe(100);
  });

  it('half when 30–60 days out', () => {
    expect(tierForDaysUntilMoveIn(60).id).toBe('half');
    expect(tierForDaysUntilMoveIn(30).id).toBe('half');
    expect(tierForDaysUntilMoveIn(45).refundPercent).toBe(50);
  });

  it('zero refund within 30 days (not shown in UI)', () => {
    expect(tierForDaysUntilMoveIn(29).id).toBe('none');
    expect(tierForDaysUntilMoveIn(0).refundPercent).toBe(0);
  });

  it('treats invalid input as zero-refund', () => {
    expect(tierForDaysUntilMoveIn(NaN).id).toBe('none');
    expect(tierForDaysUntilMoveIn(-5).id).toBe('none');
  });
});
