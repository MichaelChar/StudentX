import { describe, it, expect } from 'vitest';
import {
  validateDateOfBirth,
  ageFromDateOfBirth,
  parseDateOfBirth,
  validateLanguages,
  validateBio,
  parseProfileUpdates,
  missingProfileFields,
  isProfileComplete,
  toGuestProfile,
  MIN_AGE,
  BIO_MAX_CHARS,
} from '@/lib/studentProfileFields';

describe('validateDateOfBirth', () => {
  const asOf = new Date('2026-08-02T12:00:00Z');

  it('accepts a real past date for someone 16+', () => {
    const r = validateDateOfBirth('2000-01-15', asOf);
    expect(r.ok).toBe(true);
    expect(r.value).toBe('2000-01-15');
  });

  it('rejects an impossible calendar date', () => {
    const r = validateDateOfBirth('2020-02-30', asOf);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/real date/i);
  });

  it('rejects a future date', () => {
    const r = validateDateOfBirth('2030-01-01', asOf);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/past/i);
  });

  it('rejects under-16 (age-16 boundary)', () => {
    // Born 2011-08-03 → age 14 on 2026-08-02
    const r = validateDateOfBirth('2011-08-03', asOf);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(new RegExp(String(MIN_AGE)));
  });

  it('accepts exactly age 16 on birthday', () => {
    const r = validateDateOfBirth('2010-08-02', asOf);
    expect(r.ok).toBe(true);
    expect(ageFromDateOfBirth(r.value, asOf)).toBe(16);
  });

  it('rejects day before 16th birthday', () => {
    const r = validateDateOfBirth('2010-08-03', asOf);
    expect(r.ok).toBe(false);
  });

  it('rejects non-date strings', () => {
    expect(validateDateOfBirth('not-a-date', asOf).ok).toBe(false);
    expect(validateDateOfBirth('', asOf).ok).toBe(false);
    expect(validateDateOfBirth(null, asOf).ok).toBe(false);
  });
});

describe('ageFromDateOfBirth', () => {
  it('derives age and never stores it', () => {
    expect(ageFromDateOfBirth('2000-06-15', new Date('2026-08-02Z'))).toBe(26);
    expect(ageFromDateOfBirth(null)).toBe(null);
    expect(parseDateOfBirth('2000-13-01')).toBe(null);
  });
});

describe('validateLanguages / validateBio', () => {
  it('accepts known language ids and dedupes', () => {
    const r = validateLanguages(['en', 'el', 'en']);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual(['en', 'el']);
  });

  it('rejects unknown language codes', () => {
    const r = validateLanguages(['xx']);
    expect(r.ok).toBe(false);
  });

  it('caps bio length', () => {
    const long = 'a'.repeat(BIO_MAX_CHARS + 1);
    expect(validateBio(long).ok).toBe(false);
    expect(validateBio('Hello world').ok).toBe(true);
  });
});

describe('parseProfileUpdates + completeness', () => {
  const complete = {
    date_of_birth: '2000-01-01',
    gender: 'woman',
    nationality: 'GR',
    languages: ['en', 'el'],
    bio: 'Erasmus student looking for a quiet flat near campus.',
    home_university: 'other',
    receiving_university: 'auth',
    receiving_faculty: 'auth-main',
    funding_source: 'erasmus_grant',
  };

  it('parses a full valid payload', () => {
    const r = parseProfileUpdates(complete);
    expect(r.ok).toBe(true);
    expect(r.updates.gender).toBe('woman');
    expect(r.updates.languages).toEqual(['en', 'el']);
  });

  it('rejects invalid gender', () => {
    const r = parseProfileUpdates({ gender: 'alien' });
    expect(r.ok).toBe(false);
    expect(r.field).toBe('gender');
  });

  it('marks incomplete profiles', () => {
    expect(isProfileComplete({})).toBe(false);
    expect(missingProfileFields({}).length).toBeGreaterThan(0);
    expect(isProfileComplete(complete)).toBe(true);
    expect(missingProfileFields(complete)).toEqual([]);
  });

  it('toGuestProfile never includes email', () => {
    const guest = toGuestProfile({
      ...complete,
      student_id: 's1',
      display_name: 'Ada',
      email: 'secret@example.com',
      created_at: '2025-01-01T00:00:00Z',
    });
    expect(guest.email).toBeUndefined();
    expect(JSON.stringify(guest)).not.toMatch(/secret@example\.com/);
    expect(guest.age).toBeTypeOf('number');
    expect(guest.display_name).toBe('Ada');
  });
});
