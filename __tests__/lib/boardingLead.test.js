import { describe, it, expect } from 'vitest';
import { entryFor, isValidContact, monthKey, parseLead, startOptions } from '@/lib/boardingLead';

const values = (key) => startOptions(key).map((o) => o.value);

describe('startOptions', () => {
  it('offers next January and next September in October', () => {
    expect(values('2026-10')).toEqual(['asap', '2027-01', '2027-09', 'unsure']);
  });

  it('puts this September before next January in June', () => {
    expect(values('2026-06')).toEqual(['asap', '2026-09', '2027-01', 'unsure']);
  });

  it('moves to next September once September has arrived', () => {
    expect(values('2026-09')).toEqual(['asap', '2027-01', '2027-09', 'unsure']);
  });

  it('never offers the January that is already here', () => {
    expect(values('2027-01')).toEqual(['asap', '2027-09', '2028-01', 'unsure']);
  });
});

describe('monthKey', () => {
  it('pads the month', () => {
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01');
  });
});

describe('entryFor', () => {
  const now = '2026-10';

  it('places a 16-year-old starting now in DP 1, exams in two years', () => {
    expect(entryFor({ ageNow: 16, start: 'asap', nowKey: now })).toMatchObject({
      blocked: false, entryAge: 16, schoolYear: 2026, examYear: 2028, shifted: false,
      entry: { programme: 'DP 1', years: 2 },
    });
  });

  it('treats "not sure" like now', () => {
    expect(entryFor({ ageNow: 16, start: 'unsure', nowKey: now }).schoolYear).toBe(2026);
  });

  it('keeps a January start in the current school year', () => {
    expect(entryFor({ ageNow: 15, start: '2027-01', nowKey: now })).toMatchObject({
      schoolYear: 2026, entry: { programme: 'MYP 5' },
    });
  });

  it('makes the child a year older when they start next September', () => {
    expect(entryFor({ ageNow: 16, start: '2027-09', nowKey: now })).toMatchObject({
      entryAge: 17, schoolYear: 2027, examYear: 2028, entry: { programme: 'DP 2', years: 1 },
    });
  });

  it('blocks a 17-year-old who would start next September at 18', () => {
    expect(entryFor({ ageNow: 17, start: '2027-09', nowKey: now })).toEqual({
      blocked: true, entryAge: 18, schoolYear: 2027,
    });
  });

  it('blocks "18 or over" even starting now', () => {
    expect(entryFor({ ageNow: 18, start: 'asap', nowKey: now }).blocked).toBe(true);
  });

  it('moves "13 or under" to MYP 4 the year they turn 14', () => {
    expect(entryFor({ ageNow: 13, start: 'asap', nowKey: now })).toMatchObject({
      blocked: false, shifted: true, entryAge: 14, schoolYear: 2027, examYear: 2031,
      entry: { programme: 'MYP 4' },
    });
  });

  it('counts the school year from June, like the planner', () => {
    expect(entryFor({ ageNow: 16, start: 'asap', nowKey: '2027-06' }).schoolYear).toBe(2027);
    expect(entryFor({ ageNow: 16, start: 'asap', nowKey: '2027-05' }).schoolYear).toBe(2026);
  });
});

describe('isValidContact', () => {
  it.each([
    ['whatsapp', '+30 697 123 4567', true],
    ['viber', '(030) 697-123-4567', true],
    ['phone', '1234567', false], // 7 digits
    ['imessage', '+30 697 abc 4567', false],
    ['email', 'parent@example.com', true],
    ['email', 'parent@example', false],
    ['wechat', 'eleni_88', true],
    ['wechat', '8eleni', false], // must start with a letter
    ['wechat', 'abc', false],
    ['messenger', 'someone', false], // not offered
  ])('%s %j → %s', (method, value, expected) => {
    expect(isValidContact(method, value)).toBe(expected);
  });

  it('rejects anything over 100 characters', () => {
    expect(isValidContact('email', `${'a'.repeat(95)}@x.com`)).toBe(false);
  });
});

describe('parseLead', () => {
  const base = {
    id: '3f6c1b2e-9a4d-4c1e-8f7a-1b2c3d4e5f60',
    event: 'view',
    source: 'boarding',
    start: '2027-09',
    ageNow: 16,
    mode: 'boarding',
    path: 'resources',
    schoolsViewed: ['rosey', 'rosey', 'nope'],
    interest: [],
  };

  it('accepts a view and de-duplicates and filters school keys', () => {
    const r = parseLead(base);
    expect(r.ok).toBe(true);
    expect(r.lead.schoolsViewed).toEqual(['rosey']);
    expect(r.lead.firstName).toBeUndefined();
  });

  it.each([
    ['id', { id: 'not-a-uuid' }],
    ['event', { event: 'delete' }],
    ['source', { source: 'Partner Site' }],
    ['start', { start: '2027-03' }],
    ['ageNow', { ageNow: 12 }],
    ['mode', { mode: 'weekly' }],
    ['path', { path: 'other' }],
  ])('rejects a bad %s', (field, patch) => {
    expect(parseLead({ ...base, ...patch })).toEqual({ ok: false, error: field });
  });

  const submit = {
    ...base,
    event: 'submit',
    path: 'personalised',
    firstName: '  Eleni \n',
    contactMethod: 'whatsapp',
    contactValue: ' +30 697 123 4567 ',
    about: '  IGCSE,\r\n\r\n\r\n\r\nwants medicine  ',
  };

  it('cleans a submit', () => {
    const r = parseLead(submit);
    expect(r.ok).toBe(true);
    expect(r.lead).toMatchObject({
      firstName: 'Eleni',
      contactMethod: 'whatsapp',
      contactValue: '+30 697 123 4567',
      about: 'IGCSE,\n\nwants medicine',
    });
  });

  it('stores an empty paragraph as null', () => {
    expect(parseLead({ ...submit, about: '   ' }).lead.about).toBeNull();
  });

  it('caps the paragraph at 4000 characters', () => {
    expect(parseLead({ ...submit, about: 'x'.repeat(5000) }).lead.about).toHaveLength(4000);
  });

  it.each([
    ['firstName', { firstName: '  ' }],
    ['contactMethod', { contactMethod: 'messenger' }],
    ['contactValue', { contactValue: '12' }],
    ['path', { path: 'resources' }],
  ])('a submit needs a valid %s', (field, patch) => {
    expect(parseLead({ ...submit, ...patch })).toEqual({ ok: false, error: field });
  });
});
