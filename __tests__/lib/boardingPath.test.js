import { describe, it, expect } from 'vitest';
import { ENTRY_POINTS } from '@/components/boarding/config';
import {
  buildPath,
  currentSchoolYear,
  fill,
  formatChf,
  formatSchoolYear,
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
  const expected = {
    14: {
      years: 4,
      examYear: 2030,
      nodes: [
        { key: 'join', schoolYear: 2026 },
        { key: 'dp1', schoolYear: 2028 },
        { key: 'apply', month: 'autumn', year: 2029, optional: true },
        { key: 'exams', month: 'may', year: 2030 },
        { key: 'uni', month: 'sept', year: 2030 },
      ],
    },
    15: {
      years: 3,
      examYear: 2029,
      nodes: [
        { key: 'join', schoolYear: 2026 },
        { key: 'dp1', schoolYear: 2027 },
        { key: 'apply', month: 'autumn', year: 2028, optional: true },
        { key: 'exams', month: 'may', year: 2029 },
        { key: 'uni', month: 'sept', year: 2029 },
      ],
    },
    16: {
      years: 2,
      examYear: 2028,
      nodes: [
        { key: 'join', schoolYear: 2026 },
        { key: 'apply', month: 'autumn', year: 2027, optional: true },
        { key: 'exams', month: 'may', year: 2028 },
        { key: 'uni', month: 'sept', year: 2028 },
      ],
    },
    17: {
      years: 1,
      examYear: 2027,
      nodes: [
        { key: 'join', schoolYear: 2026 },
        { key: 'apply', month: 'autumn', year: 2026, optional: true },
        { key: 'exams', month: 'may', year: 2027 },
        { key: 'uni', month: 'sept', year: 2027 },
      ],
    },
  };

  it('covers every entry point', () => {
    expect(ENTRY_POINTS.map((entry) => entry.age)).toEqual([14, 15, 16, 17]);
  });

  for (const entry of ENTRY_POINTS) {
    it(`age ${entry.age} matches the ${expected[entry.age].years}-year timeline`, () => {
      expect(buildPath(entry, 2026)).toEqual(expected[entry.age]);
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
