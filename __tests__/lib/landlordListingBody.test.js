import { describe, it, expect, vi, beforeEach } from 'vitest';

// universityDistances hits Supabase for city IDs when university_distances
// is present; keep the default path free of that dependency.
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [], error: null }),
      }),
    }),
  }),
}));

vi.mock('@/lib/universityDistances', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCityUniversityIds: async () => new Set(['auth', 'uom']),
  };
});

import { parseListingWriteBody } from '@/lib/landlordListingBody';

const BASE = {
  title: 'Sunny Kentro studio near AUTH',
  address: 'Tsimiski 45',
  neighborhood: 'Kentro',
  property_type: 'Studio',
  lat: 40.6325,
  lng: 22.943,
};

describe('parseListingWriteBody — coordinates required', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a create body with missing lat/lng', async () => {
    const { lat, lng, ...noCoords } = BASE;
    void lat;
    void lng;
    const out = await parseListingWriteBody(noCoords, {
      requireCoords: true,
      partial: false,
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
    expect(out.error).toMatch(/lat and lng are required/i);
  });

  it('rejects null lat/lng', async () => {
    const out = await parseListingWriteBody(
      { ...BASE, lat: null, lng: null },
      { requireCoords: true, partial: false },
    );
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
    expect(out.error).toMatch(/lat and lng are required/i);
  });

  it('rejects empty-string lat/lng', async () => {
    const out = await parseListingWriteBody(
      { ...BASE, lat: '', lng: '' },
      { requireCoords: true, partial: false },
    );
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
    expect(out.error).toMatch(/lat and lng are required/i);
  });

  it('rejects only one of lat/lng', async () => {
    const out = await parseListingWriteBody(
      { ...BASE, lng: undefined },
      { requireCoords: true, partial: false },
    );
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
  });

  it('rejects Null Island (0, 0)', async () => {
    const out = await parseListingWriteBody(
      { ...BASE, lat: 0, lng: 0 },
      { requireCoords: true, partial: false },
    );
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
    expect(out.error).toMatch(/valid coordinates/i);
  });

  it('rejects out-of-range coordinates', async () => {
    const out = await parseListingWriteBody(
      { ...BASE, lat: 91, lng: 22.94 },
      { requireCoords: true, partial: false },
    );
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
    expect(out.error).toMatch(/valid coordinates/i);
  });

  it('accepts a body with valid lat/lng', async () => {
    const out = await parseListingWriteBody(BASE, {
      requireCoords: true,
      partial: false,
    });
    expect(out.ok).toBe(true);
    expect(out.data.lat).toBeCloseTo(40.6325);
    expect(out.data.lng).toBeCloseTo(22.943);
  });

  it('accepts Athens coordinates (no longer city-locked to Thessaloniki)', async () => {
    const out = await parseListingWriteBody(
      { ...BASE, lat: 37.9838, lng: 23.7275 },
      { requireCoords: true, partial: false },
    );
    expect(out.ok).toBe(true);
    expect(out.data.lat).toBeCloseTo(37.9838);
    expect(out.data.lng).toBeCloseTo(23.7275);
  });

  it('on partial update without lat/lng, does not require them', async () => {
    const out = await parseListingWriteBody(
      { title: 'Updated title only' },
      { requireCoords: false, partial: true },
    );
    expect(out.ok).toBe(true);
    expect(out.data.lat).toBeUndefined();
    expect(out.data.lng).toBeUndefined();
  });

  it('on partial update with invalid lat, rejects', async () => {
    const out = await parseListingWriteBody(
      { lat: 'not-a-number', lng: 22.94 },
      { requireCoords: false, partial: true },
    );
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
  });
});
