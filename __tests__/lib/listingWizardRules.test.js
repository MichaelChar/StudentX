import { describe, it, expect } from 'vitest';
import {
  validateUniversityDistancesMandatory,
  validatePhotoMinimum,
  validateRequiredCoords,
  MIN_PHOTOS,
  EXCLUDED_PROPERTY_TYPES,
  EXCLUDED_AMENITY_NAMES,
} from '@/lib/listingWizardRules';
import {
  parseUniversityDistances,
  MIN_UNIVERSITY_DISTANCES,
} from '@/lib/universityDistances';

const VALID = new Set(['auth', 'uom', 'ihu']);

describe('mandatory university distances (≥2)', () => {
  it('rejects fewer than 2 filled rows', () => {
    expect(validateUniversityDistancesMandatory([]).ok).toBe(false);
    expect(
      validateUniversityDistancesMandatory([
        { university_id: 'auth', distance_meters: 500 },
      ]).ok,
    ).toBe(false);
    expect(
      validateUniversityDistancesMandatory([
        { university_id: 'auth', distance_meters: '' },
        { university_id: 'uom', distance_meters: '' },
      ]).ok,
    ).toBe(false);
  });

  it('accepts two or more filled rows', () => {
    expect(
      validateUniversityDistancesMandatory([
        { university_id: 'auth', distance_meters: 500 },
        { university_id: 'uom', distance_meters: 1200 },
      ]).ok,
    ).toBe(true);
  });

  it('parseUniversityDistances enforces requireMin on submit path', () => {
    const one = parseUniversityDistances(
      [{ university_id: 'auth', distance_meters: 500 }],
      VALID,
      { requireMin: MIN_UNIVERSITY_DISTANCES },
    );
    expect(one.error).toMatch(/at least 2/);

    const two = parseUniversityDistances(
      [
        { university_id: 'auth', distance_meters: 500 },
        { university_id: 'uom', distance_meters: 900, source: 'computed' },
      ],
      VALID,
      { requireMin: MIN_UNIVERSITY_DISTANCES },
    );
    expect(two.rows).toHaveLength(2);
    expect(two.rows[1].source).toBe('computed');
  });

  it('rejects an invalid source value', () => {
    const out = parseUniversityDistances(
      [{ university_id: 'auth', distance_meters: 500, source: 'osrm' }],
      VALID,
    );
    expect(out.error).toMatch(/source/);
  });
});

describe('photo minimum', () => {
  it(`requires at least ${MIN_PHOTOS} photos`, () => {
    expect(validatePhotoMinimum(['a', 'b', 'c', 'd']).ok).toBe(false);
    expect(validatePhotoMinimum(['a', 'b', 'c', 'd', 'e']).ok).toBe(true);
    expect(
      validatePhotoMinimum(['a', 'b'], ['c', 'd', 'e']).ok,
    ).toBe(true);
  });
});

describe('required coordinates', () => {
  it('requires finite lat/lng', () => {
    expect(validateRequiredCoords('', '').ok).toBe(false);
    expect(validateRequiredCoords(null, null).ok).toBe(false);
    expect(validateRequiredCoords(40.63, 22.94).ok).toBe(true);
    expect(validateRequiredCoords('40.63', '22.94').lat).toBeCloseTo(40.63);
  });
});

describe('form filters', () => {
  it('excludes the 2-Bedroom (x2) artefact and Ground floor amenity', () => {
    expect(EXCLUDED_PROPERTY_TYPES.has('2-Bedroom (x2)')).toBe(true);
    expect(EXCLUDED_AMENITY_NAMES.has('Ground floor')).toBe(true);
  });
});
