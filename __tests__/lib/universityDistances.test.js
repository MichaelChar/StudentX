import { describe, it, expect } from 'vitest';
import {
  parseUniversityDistances,
  MAX_DISTANCE_METERS,
  hasFilledDistance,
  mergePrefillUniversityDistances,
} from '@/lib/universityDistances';

const VALID = new Set(['auth', 'uom', 'ihu']);

const COMPUTED = [
  { university_id: 'auth', distance_meters: 800, source: 'computed' },
  { university_id: 'uom', distance_meters: 1500, source: 'computed' },
  { university_id: 'ihu', distance_meters: 4200, source: 'computed' },
];

describe('hasFilledDistance', () => {
  it.each([
    [1200, true],
    ['1200', true],
    [' 900 ', true],
    [1, true],
    ['', false],
    ['   ', false],
    [0, false],
    ['0', false],
    [null, false],
    [undefined, false],
    ['abc', false],
    [NaN, false],
  ])('hasFilledDistance(%j) → %s', (value, expected) => {
    expect(hasFilledDistance(value)).toBe(expected);
  });
});

describe('mergePrefillUniversityDistances', () => {
  it('fills an empty form with nearest computed unis up to maxRows', () => {
    expect(mergePrefillUniversityDistances([], COMPUTED, 2)).toEqual([
      { university_id: 'auth', distance_meters: '800', source: 'computed' },
      { university_id: 'uom', distance_meters: '1500', source: 'computed' },
    ]);
  });

  it('fills empty landlord rows created by +Add (the reported bug)', () => {
    const existing = [
      { university_id: 'auth', distance_meters: '800', source: 'computed' },
      { university_id: 'uom', distance_meters: '1500', source: 'computed' },
      // addRow() used to insert source=landlord + empty metres
      { university_id: 'ihu', distance_meters: '', source: 'landlord' },
    ];
    const out = mergePrefillUniversityDistances(existing, COMPUTED, 3);
    expect(out).toEqual([
      { university_id: 'auth', distance_meters: '800', source: 'computed' },
      { university_id: 'uom', distance_meters: '1500', source: 'computed' },
      { university_id: 'ihu', distance_meters: '4200', source: 'computed' },
    ]);
  });

  it('preserves landlord-edited distances and still fills other unis', () => {
    const existing = [
      { university_id: 'auth', distance_meters: '999', source: 'landlord' },
      { university_id: 'ihu', distance_meters: '', source: 'landlord' },
    ];
    const out = mergePrefillUniversityDistances(existing, COMPUTED, 3);
    expect(out).toEqual([
      { university_id: 'auth', distance_meters: '999', source: 'landlord' },
      { university_id: 'ihu', distance_meters: '4200', source: 'computed' },
      // remaining nearest not yet listed
      { university_id: 'uom', distance_meters: '1500', source: 'computed' },
    ]);
  });

  it('refreshes previously computed rows from a new pin result', () => {
    const existing = [
      { university_id: 'auth', distance_meters: '100', source: 'computed' },
    ];
    const out = mergePrefillUniversityDistances(existing, COMPUTED, 3);
    expect(out[0]).toEqual({
      university_id: 'auth',
      distance_meters: '800',
      source: 'computed',
    });
    expect(out.map((r) => r.university_id)).toEqual(['auth', 'uom', 'ihu']);
  });

  it('keeps an empty shell when the pin has no value for that uni', () => {
    const existing = [
      { university_id: 'oxford', distance_meters: '', source: 'landlord' },
    ];
    const out = mergePrefillUniversityDistances(existing, COMPUTED, 3);
    expect(out[0]).toEqual({
      university_id: 'oxford',
      distance_meters: '',
      source: 'landlord',
    });
    // still appends known computed unis
    expect(out.slice(1).map((r) => r.university_id)).toEqual([
      'auth',
      'uom',
    ]);
  });
});

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
        { university_id: 'auth', distance_meters: 750, source: 'landlord' },
        { university_id: 'uom', distance_meters: 1900, source: 'landlord' },
      ],
    });
  });

  it('preserves computed vs landlord source', () => {
    const out = parseUniversityDistances(
      [
        { university_id: 'auth', distance_meters: 750, source: 'computed' },
        { university_id: 'uom', distance_meters: 1900, source: 'landlord' },
      ],
      VALID,
    );
    expect(out.rows).toEqual([
      { university_id: 'auth', distance_meters: 750, source: 'computed' },
      { university_id: 'uom', distance_meters: 1900, source: 'landlord' },
    ]);
  });

  it('rejects an invalid source', () => {
    const out = parseUniversityDistances(
      [{ university_id: 'auth', distance_meters: 500, source: 'osrm' }],
      VALID,
    );
    expect(out.error).toMatch(/source/);
  });

  it('accepts the numeric strings a form sends', () => {
    const out = parseUniversityDistances(
      [{ university_id: 'ihu', distance_meters: ' 1200 ' }],
      VALID,
    );
    expect(out.rows).toEqual([
      { university_id: 'ihu', distance_meters: 1200, source: 'landlord' },
    ]);
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
