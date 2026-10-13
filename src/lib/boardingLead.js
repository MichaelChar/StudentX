/*
  /boarding lead form: answer options, the child's entry point, and the
  checks on what a parent types. Shared by the form (LeadForm.js) and the
  endpoint (api/boarding/lead), so the browser and the server can never
  disagree about what is valid.

  Dates are passed around as a month key, 'YYYY-MM', rather than a Date. The
  form renders on the server at build time and again in the browser, and a
  plain string is what useSyncExternalStore needs for its two snapshots.
*/
import { ENTRY_POINTS, MAP_SCHOOLS } from '@/components/boarding/config';

export const AGE_VALUES = [13, 14, 15, 16, 17, 18]; // 13 = "13 or under", 18 = "18 or over"
export const MODES = ['boarding', 'day', 'undecided'];
export const PATHS = ['resources', 'personalised'];
export const SCHOOL_KEYS = MAP_SCHOOLS.map((s) => s.key);

// Phone-based methods share one phone field.
export const CONTACT_METHODS = [
  { key: 'whatsapp', kind: 'phone' },
  { key: 'viber', kind: 'phone' },
  { key: 'imessage', kind: 'phone' },
  { key: 'phone', kind: 'phone' },
  { key: 'email', kind: 'email' },
  { key: 'wechat', kind: 'wechat' },
];

export const LEAD_LIMITS = { firstName: 60, contact: 100, about: 4000 };

const ENTRY_AGE_MIN = ENTRY_POINTS[0].age; // 14, MYP 4
const ENTRY_AGE_MAX = ENTRY_POINTS[ENTRY_POINTS.length - 1].age; // 17, DP 2

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { y, m };
}

// Same boundary as currentSchoolYear in boardingPath.js: June onwards counts
// as the school year starting that September.
function schoolYearOfMonth(key) {
  const { y, m } = parseMonthKey(key);
  return m >= 6 ? y : y - 1;
}

/*
  The four start options, worked out from "now" so they never go stale.
  `value` is what gets stored: 'asap', 'unsure', or the month as 'YYYY-MM'.
  The next January is always next calendar year; the next September is this
  year's until September arrives (and from then ASAP covers it).
*/
export function startOptions(nowKey) {
  const { y, m } = parseMonthKey(nowKey);
  const dated = [
    { key: 'jan', year: y + 1, month: 1 },
    { key: 'sept', year: m < 9 ? y : y + 1, month: 9 },
  ]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((o) => ({ key: o.key, year: o.year, value: `${o.year}-${String(o.month).padStart(2, '0')}` }));
  return [{ key: 'asap', value: 'asap' }, ...dated, { key: 'unsure', value: 'unsure' }];
}

const START_VALUE_RE = /^(asap|unsure|\d{4}-(01|09))$/;

export function isStartValue(value) {
  return typeof value === 'string' && START_VALUE_RE.test(value);
}

/*
  Where the child joins, given their age today and when they would start.
  A child who starts in a later school year is that many years older on
  entry, so a 16-year-old starting next September joins at 17 (DP 2).

  - Older than the last entry point on arrival: `blocked`.
  - Younger than the first: they join MYP 4 the year they turn 14, and
    `shifted` says the start moved.
*/
export function entryFor({ ageNow, start, nowKey }) {
  const nowYear = schoolYearOfMonth(nowKey);
  let schoolYear = start === 'asap' || start === 'unsure' ? nowYear : schoolYearOfMonth(start);
  let entryAge = ageNow + (schoolYear - nowYear);
  if (entryAge > ENTRY_AGE_MAX) return { blocked: true, entryAge, schoolYear };
  let shifted = false;
  if (entryAge < ENTRY_AGE_MIN) {
    schoolYear += ENTRY_AGE_MIN - entryAge;
    entryAge = ENTRY_AGE_MIN;
    shifted = true;
  }
  const entry = ENTRY_POINTS.find((e) => e.age === entryAge);
  return { blocked: false, entry, entryAge, schoolYear, examYear: schoolYear + entry.years, shifted };
}

export function contactKind(method) {
  return CONTACT_METHODS.find((m) => m.key === method)?.kind ?? null;
}

const CONTACT_RULES = {
  // Digits, spaces, + ( ) . - only, and at least 8 digits.
  phone: (s) => /^\+?[\d\s().-]+$/.test(s) && s.replace(/\D/g, '').length >= 8,
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  // WeChat IDs: 6–20 characters, letters, digits, - and _, starting with a letter.
  wechat: (s) => /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/.test(s),
};

export function isValidContact(method, value) {
  const kind = contactKind(method);
  if (!kind || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= LEAD_LIMITS.contact && CONTACT_RULES[kind](trimmed);
}

function cleanLine(value, max) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  return s ? [...s].slice(0, max).join('') : null;
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const s = value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s ? [...s].slice(0, max).join('') : null;
}

function schoolList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((k) => typeof k === 'string' && SCHOOL_KEYS.includes(k)))];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_RE = /^[a-z0-9-]{1,40}$/;
export const LEAD_EVENTS = ['view', 'update', 'submit'];

/*
  Validates a POST body from the form. Returns { ok: true, lead } with
  cleaned values, or { ok: false, error } naming the first bad field.

  `view`   — the result screen was reached on the "just show me" path.
  `update` — map taps or "Ask me about…" after the result showed.
  `submit` — the personalised path's Send; contact details are required.
*/
export function parseLead(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body' };
  const { id, event } = body;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { ok: false, error: 'id' };
  if (!LEAD_EVENTS.includes(event)) return { ok: false, error: 'event' };
  if (typeof body.source !== 'string' || !SOURCE_RE.test(body.source)) return { ok: false, error: 'source' };
  if (!isStartValue(body.start)) return { ok: false, error: 'start' };
  if (!AGE_VALUES.includes(body.ageNow)) return { ok: false, error: 'ageNow' };
  if (!MODES.includes(body.mode)) return { ok: false, error: 'mode' };
  if (!PATHS.includes(body.path)) return { ok: false, error: 'path' };

  const lead = {
    id,
    event,
    source: body.source,
    start: body.start,
    ageNow: body.ageNow,
    mode: body.mode,
    path: body.path,
    schoolsViewed: schoolList(body.schoolsViewed),
    interest: schoolList(body.interest),
  };

  if (event === 'submit') {
    if (body.path !== 'personalised') return { ok: false, error: 'path' };
    const firstName = cleanLine(body.firstName, LEAD_LIMITS.firstName);
    if (!firstName) return { ok: false, error: 'firstName' };
    if (!contactKind(body.contactMethod)) return { ok: false, error: 'contactMethod' };
    if (!isValidContact(body.contactMethod, body.contactValue)) return { ok: false, error: 'contactValue' };
    lead.firstName = firstName;
    lead.contactMethod = body.contactMethod;
    lead.contactValue = body.contactValue.trim();
    lead.about = cleanText(body.about, LEAD_LIMITS.about);
  }

  return { ok: true, lead };
}
