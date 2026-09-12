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

  /*
    Migration 119. Prod's `faculties` holds AUTH rows only, so without the
    university fallback UoM and IHU cannot be measured at all — which is what
    left the read-only wizard step with one distance and a gate it could not
    satisfy.
  */
  it('measures faculty-less universities from their own coordinates', async () => {
    const out = await computeUniversityDistances(
      { lat: 40.63, lng: 22.94 },
      [{ faculty_id: 'a1', university: 'AUTH', lat: 40.63, lng: 22.95 }],
      {
        useOsrm: false,
        universities: [
          { university_id: 'auth', lat: 40.6296719, lng: 22.9591469 },
          { university_id: 'uom', lat: 40.6252099, lng: 22.9599727 },
          { university_id: 'ihu', lat: 40.6575637, lng: 22.8108475 },
        ],
      },
    );
    expect(out.map((r) => r.university_id).sort()).toEqual(['auth', 'ihu', 'uom']);
    expect(out.every((r) => r.distance_meters > 0)).toBe(true);
  });

  it('prefers a faculty campus over the university centroid', async () => {
    const origin = { lat: 40.63, lng: 22.94 };
    // The faculty sits much nearer the origin than the university point.
    const withFaculty = await computeUniversityDistances(
      origin,
      [{ faculty_id: 'a1', university: 'AUTH', lat: 40.63, lng: 22.941 }],
      {
        useOsrm: false,
        universities: [{ university_id: 'auth', lat: 40.58, lng: 23.01 }],
      },
    );
    expect(withFaculty).toHaveLength(1);
    expect(withFaculty[0].distance_meters).toBeLessThan(500);
  });

  it('ignores university rows with unusable coordinates', async () => {
    const out = await computeUniversityDistances(
      { lat: 40.63, lng: 22.94 },
      [],
      {
        useOsrm: false,
        universities: [
          { university_id: 'uom', lat: null, lng: null },
          { university_id: 'ihu', lat: 'abc', lng: 22.81 },
          { university_id: 'auth', lat: 40.6296719, lng: 22.9591469 },
        ],
      },
    );
    expect(out.map((r) => r.university_id)).toEqual(['auth']);
  });

  it('returns nothing when neither source has coordinates', async () => {
    expect(
      await computeUniversityDistances({ lat: 40.63, lng: 22.94 }, [], {
        useOsrm: false,
      }),
    ).toEqual([]);
  });
});
