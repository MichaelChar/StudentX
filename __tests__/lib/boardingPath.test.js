import { describe, it, expect } from 'vitest';
import { ENTRY_POINTS } from '@/components/boarding/config';
import {
  buildPath,
  currentSchoolYear,
  fill,
  formatChf,
  formatSchoolYear,
  splitScore,
} from '@/lib/boardingPath';

describe('currentSchoolYear', () => {
  it('counts October as the school year that started that calendar year', () => {
    expect(currentSchoolYear(new Date(2026, 9, 11))).toBe(2026);
  });

  it('keeps March in the school year that started the previous calendar year', () => {
    expect(currentSchoolYear(new Date(2027, 2, 1))).toBe(2026);
  });

  it('keeps the end of May in the school year that is still in exams', () => {
    expect(currentSchoolYear(new Date(2027, 4, 31))).toBe(2026);
  });

  it('rolls to the next school year on 1 June', () => {
    expect(currentSchoolYear(new Date(2027, 5, 1))).toBe(2027);
  });
});

describe('formatSchoolYear', () => {
  it('uses an en dash and a two-digit end year', () => {
    expect(formatSchoolYear(2026)).toBe('2026\u201327');
  });

  it('wraps the two-digit end year at the century', () => {
    expect(formatSchoolYear(2099)).toBe('2099\u201300');
  });
});

describe('buildPath', () => {
  // October 2026: school year S = 2026. Keys, years and months from the brief.
  const ladder = ENTRY_POINTS.map((entry) => entry.programme);
  const join = { key: 'join', kind: 'join', schoolYear: 2026 };
  const up = (programme, schoolYear) => ({ key: `up-${programme}`, kind: 'up', programme, schoolYear });
  const tail = (final) => [
    { key: 'apply', kind: 'apply', month: 'autumn', year: final - 1, optional: true },
    { key: 'exams', kind: 'exams', month: 'may', year: final },
    { key: 'uni', kind: 'uni', month: 'sept', year: final },
  ];
  const expected = {
    14: { years: 4, examYear: 2030, nodes: [join, up('MYP 5', 2027), up('DP 1', 2028), up('DP 2', 2029), ...tail(2030)] },
    15: { years: 3, examYear: 2029, nodes: [join, up('DP 1', 2027), up('DP 2', 2028), ...tail(2029)] },
    16: { years: 2, examYear: 2028, nodes: [join, up('DP 2', 2027), ...tail(2028)] },
    17: { years: 1, examYear: 2027, nodes: [join, ...tail(2027)] },
  };

  it('covers every entry point', () => {
    expect(ENTRY_POINTS.map((entry) => entry.age)).toEqual([14, 15, 16, 17]);
  });

  for (const entry of ENTRY_POINTS) {
    it(`age ${entry.age} matches the ${expected[entry.age].years}-year timeline`, () => {
      expect(buildPath(entry, 2026, ladder)).toEqual(expected[entry.age]);
    });
  }
});

describe('formatChf', () => {
  it('groups thousands with no-break spaces', () => {
    expect(formatChf(210000)).toBe('CHF\u00a0210\u00a0000');
    expect(formatChf(50000)).toBe('CHF\u00a050\u00a0000');
  });
});

describe('fill', () => {
  it('replaces known placeholders and leaves the rest', () => {
    expect(fill('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
  });
});

describe('splitScore', () => {
  it('splits a score that starts the string', () => {
    expect(splitScore('43/45 bilingual IB Diploma with 4 HLs')).toEqual({
      before: '',
      to: 43,
      of: '45',
      after: ' bilingual IB Diploma with 4 HLs',
    });
  });

  it('splits a score with text on both sides', () => {
    expect(splitScore('scored 38/45 here')).toEqual({
      before: 'scored ',
      to: 38,
      of: '45',
      after: ' here',
    });
  });

  it('returns null when there is no score', () => {
    expect(splitScore('no score')).toBeNull();
  });
});
