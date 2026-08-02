import { describe, it, expect } from 'vitest';
import {
  pickCompletedPropertyVerification,
  isPropertyVerified,
  hasPendingPropertyVerification,
  isPendingPropertyVerificationRow,
  isRejectedPropertyVerificationRow,
  formatPropertyVerificationDate,
  buildPropertyVerificationDisclosure,
} from '@/lib/propertyVerification';

describe('propertyVerification helpers', () => {
  it('treats a listing as property-verified only when verified_at is set', () => {
    expect(isPropertyVerified(null)).toBe(false);
    expect(isPropertyVerified([])).toBe(false);
    expect(
      isPropertyVerified([
        { method: 'video_call', status: 'pending', verified_at: null },
      ]),
    ).toBe(false);
    // status=approved without verified_at must not badge
    expect(
      isPropertyVerified([
        { method: 'video_call', status: 'approved', verified_at: null },
      ]),
    ).toBe(false);
    expect(
      isPropertyVerified([
        {
          method: 'video_call',
          status: 'approved',
          verified_at: '2026-08-12T10:00:00.000Z',
        },
      ]),
    ).toBe(true);
  });

  it('picks the most recent completed verification', () => {
    const picked = pickCompletedPropertyVerification([
      {
        verification_id: 'old',
        method: 'video_call',
        status: 'approved',
        verified_at: '2026-01-01T00:00:00.000Z',
      },
      {
        verification_id: 'new',
        method: 'video_call',
        status: 'approved',
        verified_at: '2026-08-12T10:00:00.000Z',
      },
      {
        verification_id: 'pending',
        method: 'video_call',
        status: 'pending',
        verified_at: null,
      },
    ]);
    expect(picked.verification_id).toBe('new');
    expect(picked.method).toBe('video_call');
  });

  it('detects pending vs rejected rows via status column', () => {
    const pending = {
      status: 'pending',
      verified_at: null,
      checklist_json: {},
    };
    const rejected = {
      status: 'rejected',
      verified_at: null,
      checklist_json: {},
    };
    expect(isPendingPropertyVerificationRow(pending)).toBe(true);
    expect(isRejectedPropertyVerificationRow(pending)).toBe(false);
    expect(isPendingPropertyVerificationRow(rejected)).toBe(false);
    expect(isRejectedPropertyVerificationRow(rejected)).toBe(true);
    expect(hasPendingPropertyVerification([pending, rejected])).toBe(true);
    expect(hasPendingPropertyVerification([rejected])).toBe(false);
  });

  it('builds disclosure text that includes method and date', () => {
    const text = buildPropertyVerificationDisclosure({
      method: 'video_call',
      verified_at: '2026-08-12T10:00:00.000Z',
    });
    expect(text).toMatch(/Video-verified/i);
    expect(text).toMatch(/StudentX/);
    expect(text).toContain(formatPropertyVerificationDate('2026-08-12T10:00:00.000Z'));
    // Date pieces (locale-independent enough for en-GB short month)
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/Aug/i);
    expect(text).toMatch(/12/);
    expect(text).toMatch(/room, address and access/i);
  });
});
