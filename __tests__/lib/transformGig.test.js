import { describe, it, expect } from 'vitest';
import { transformGig } from '@/lib/transformGig';

describe('transformGig', () => {
  const baseRow = {
    gig_id: '00000000-0000-4000-a000-000000000001',
    title: 'Beach Bar Staff',
    employer_name: 'Sunset Beach Bar',
    description: 'Serve drinks on the beach.',
    is_paid: true,
    pay_amount: 1100,
    pay_period: 'month',
    currency: 'EUR',
    country_code: 'GR',
    city: 'Halkidiki',
    lat: 40.161,
    lng: 23.45,
    available_from: '2026-06-20',
    min_duration_weeks: 8,
    photos: ['https://example.com/a.jpg'],
    contact_info: 'jobs@sunsetbeachbar.example',
    created_at: '2026-06-01T00:00:00Z',
  };

  it('flattens a paid gig and enriches country metadata', () => {
    const g = transformGig(baseRow);
    expect(g.gig_id).toBe(baseRow.gig_id);
    expect(g.is_paid).toBe(true);
    expect(g.pay_amount).toBe(1100);
    expect(g.country_code).toBe('GR');
    expect(g.country_name).toBe('Greece');
    expect(g.country_flag).toBe('🇬🇷');
    expect(g.min_duration_weeks).toBe(8);
  });

  it('never exposes the owner-only contact_info', () => {
    const g = transformGig(baseRow);
    expect(g).not.toHaveProperty('contact_info');
  });

  it('coerces a missing pay_amount to null for unpaid gigs', () => {
    const g = transformGig({ ...baseRow, is_paid: false, pay_amount: null });
    expect(g.is_paid).toBe(false);
    expect(g.pay_amount).toBeNull();
  });

  it('handles an unknown country code without throwing', () => {
    const g = transformGig({ ...baseRow, country_code: 'ZZ' });
    expect(g.country_code).toBe('ZZ');
    expect(g.country_name).toBeNull();
    expect(g.country_flag).toBeNull();
  });

  it('defaults photos to an array', () => {
    const g = transformGig({ ...baseRow, photos: null });
    expect(g.photos).toEqual([]);
  });
});
