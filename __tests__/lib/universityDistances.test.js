import { describe, it, expect } from 'vitest';
import {
  parseUniversityDistances,
  MAX_DISTANCE_METERS,
} from '@/lib/universityDistances';

const VALID = new Set(['auth', 'uom', 'ihu']);

describe('parseUniversityDistances', () => {
  it('accepts a well-formed payload', () => {
    const out = parseUniversityDistances(
      [
        { university_id: 'auth', distance_meters: 750 },
        { university_id: 'uom', distance_meters: 1900 },
      ],
      VALID,
    );
    expect(out).toEqual({
      rows: [
        { university_id: 'auth', distance_meters: 750 },
        { university_id: 'uom', distance_meters: 1900 },
      ],
    });
  });

  it('accepts the numeric strings a form sends', () => {
    const out = parseUniversityDistances(
      [{ university_id: 'ihu', distance_meters: ' 1200 ' }],
      VALID,
    );
    expect(out.rows).toEqual([{ university_id: 'ihu', distance_meters: 1200 }]);
  });

  it('treats an empty array as "clear every row"', () => {
    expect(parseUniversityDistances([], VALID)).toEqual({ rows: [] });
  });

  it('rejects a university outside the listing city', () => {
    const out = parseUniversityDistances(
      [{ university_id: 'oxford', distance_meters: 500 }],
      VALID,
    );
    expect(out.error).toMatch(/unknown university_id/);
  });

  it('rejects duplicate universities', () => {
    const out = parseUniversityDistances(
      [
        { university_id: 'auth', distance_meters: 500 },
        { university_id: 'auth', distance_meters: 900 },
      ],
      VALID,
    );
    expect(out.error).toMatch(/duplicate university_id/);
  });

  it.each([
    ['zero', 0],
    ['negative', -100],
    ['fractional', 1200.5],
    ['non-numeric', 'about a kilometre'],
    ['over the ceiling', MAX_DISTANCE_METERS + 1],
    ['NaN', NaN],
    ['null', null],
  ])('rejects a %s distance', (_label, value) => {
    const out = parseUniversityDistances(
      [{ university_id: 'auth', distance_meters: value }],
      VALID,
    );
    expect(out.error).toMatch(/distance_meters/);
  });

  it('accepts exactly the ceiling', () => {
    const out = parseUniversityDistances(
      [{ university_id: 'auth', distance_meters: MAX_DISTANCE_METERS }],
      VALID,
    );
    expect(out.rows).toHaveLength(1);
  });

  it('rejects a non-array payload', () => {
    expect(parseUniversityDistances(null, VALID).error).toMatch(/must be an array/);
    expect(parseUniversityDistances({ auth: 500 }, VALID).error).toMatch(/must be an array/);
  });

  it('rejects non-object entries', () => {
    expect(parseUniversityDistances(['auth'], VALID).error).toBeTruthy();
  });
});
