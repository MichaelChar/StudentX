import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  universityCodeToId,
  collapseNearestPerUniversity,
  computeUniversityDistances,
} from '@/lib/computeUniversityDistances';

describe('universityCodeToId', () => {
  it('maps seeded faculty codes', () => {
    expect(universityCodeToId('AUTH')).toBe('auth');
    expect(universityCodeToId('UoM')).toBe('uom');
    expect(universityCodeToId('IHU')).toBe('ihu');
  });
});

describe('haversineMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineMeters(40.63, 22.94, 40.63, 22.94)).toBe(0);
  });

  it('is positive for distinct points in Thessaloniki', () => {
    const d = haversineMeters(40.63, 22.94, 40.64, 22.95);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(5000);
  });
});

describe('collapseNearestPerUniversity', () => {
  it('keeps the nearest campus per university', () => {
    const out = collapseNearestPerUniversity([
      { university_id: 'auth', distance_meters: 2000 },
      { university_id: 'auth', distance_meters: 800 },
      { university_id: 'uom', distance_meters: 1500 },
    ]);
    expect(out).toEqual([
      { university_id: 'auth', distance_meters: 800, source: 'computed' },
      { university_id: 'uom', distance_meters: 1500, source: 'computed' },
    ]);
  });
});

describe('computeUniversityDistances', () => {
  it('falls back to haversine when OSRM is skipped', async () => {
    const out = await computeUniversityDistances(
      { lat: 40.63, lng: 22.94 },
      [
        { faculty_id: 'a1', university: 'AUTH', lat: 40.63, lng: 22.95 },
        { faculty_id: 'u1', university: 'UoM', lat: 40.625, lng: 22.96 },
      ],
      { useOsrm: false },
    );
    expect(out.length).toBe(2);
    expect(out.every((r) => r.source === 'computed')).toBe(true);
    expect(out[0].distance_meters).toBeLessThanOrEqual(out[1].distance_meters);
  });
});
