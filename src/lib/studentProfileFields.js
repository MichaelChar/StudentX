/**
 * Controlled lists + validation for the student guest-profile fields
 * (migration 100). Age is derived from date_of_birth at render time —
 * never stored.
 */

import { normalizeMultiLine, normalizeSingleLine, codepointLength } from '@/lib/textNormalize';

export const BIO_MAX_CHARS = 600;
export const MIN_AGE = 16;

/** Gender values accepted by the API and selects. */
export const GENDERS = Object.freeze([
  'woman',
  'man',
  'non_binary',
  'prefer_not_to_say',
]);

/** How the stay is funded — shown to the landlord pre-accept. */
export const FUNDING_SOURCES = Object.freeze([
  'parents',
  'scholarship',
  'erasmus_grant',
  'personal_savings',
  'loan',
  'other',
]);

/**
 * Universities a student may pick. Receiving is limited to Thessaloniki
 * campuses; home includes the same set plus `other` for outbound origins.
 * Values are stable ids (not free-form labels).
 */
export const UNIVERSITIES = Object.freeze([
  { id: 'auth', label: 'Aristotle University of Thessaloniki (AUTH)' },
  { id: 'uom', label: 'University of Macedonia (UoM)' },
  { id: 'ihu', label: 'International Hellenic University (IHU)' },
  { id: 'other', label: 'Other' },
]);

export const UNIVERSITY_IDS = Object.freeze(UNIVERSITIES.map((u) => u.id));

/**
 * Receiving faculty / campus options (ids align with the faculties seed so
 * labels stay stable if we later join the table).
 */
export const RECEIVING_FACULTIES = Object.freeze([
  { id: 'auth-main', label: 'AUTH Main Campus', university: 'auth' },
  { id: 'auth-medical', label: 'AUTH Medical School', university: 'auth' },
  { id: 'auth-agriculture', label: 'AUTH School of Agriculture', university: 'auth' },
  { id: 'auth-economics', label: 'Faculty of Social & Economic Sciences', university: 'auth' },
  { id: 'auth-education', label: 'Faculty of Education', university: 'auth' },
  { id: 'auth-engineering', label: 'Faculty of Engineering', university: 'auth' },
  { id: 'auth-fine-arts', label: 'Faculty of Fine Arts', university: 'auth' },
  { id: 'auth-law', label: 'Faculty of Law', university: 'auth' },
  { id: 'auth-pe', label: 'Faculty of Physical Education & Sport Sciences', university: 'auth' },
  { id: 'auth-philosophy', label: 'Faculty of Philosophy', university: 'auth' },
  { id: 'auth-sciences', label: 'Faculty of Sciences', university: 'auth' },
  { id: 'auth-theology', label: 'Faculty of Theology', university: 'auth' },
  { id: 'uom-main', label: 'UoM Main Campus', university: 'uom' },
  { id: 'ihu-thermi', label: 'IHU Thermi Campus', university: 'ihu' },
  { id: 'ihu-sindos', label: 'IHU Sindos Campus', university: 'ihu' },
  { id: 'other', label: 'Other / not listed', university: 'other' },
]);

export const RECEIVING_FACULTY_IDS = Object.freeze(
  RECEIVING_FACULTIES.map((f) => f.id),
);

/** Spoken languages (ISO-ish short codes). */
export const LANGUAGES = Object.freeze([
  { id: 'en', label: 'English' },
  { id: 'el', label: 'Greek' },
  { id: 'de', label: 'German' },
  { id: 'fr', label: 'French' },
  { id: 'es', label: 'Spanish' },
  { id: 'it', label: 'Italian' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'nl', label: 'Dutch' },
  { id: 'pl', label: 'Polish' },
  { id: 'ro', label: 'Romanian' },
  { id: 'bg', label: 'Bulgarian' },
  { id: 'tr', label: 'Turkish' },
  { id: 'ar', label: 'Arabic' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ru', label: 'Russian' },
  { id: 'sq', label: 'Albanian' },
  { id: 'sr', label: 'Serbian' },
  { id: 'hr', label: 'Croatian' },
  { id: 'uk', label: 'Ukrainian' },
  { id: 'hi', label: 'Hindi' },
]);

export const LANGUAGE_IDS = Object.freeze(LANGUAGES.map((l) => l.id));

/**
 * Nationalities shown in the select (ISO 3166-1 alpha-2). Not exhaustive —
 * covers common Erasmus / Mediterranean origins plus `other`.
 */
export const NATIONALITIES = Object.freeze([
  { id: 'GR', label: 'Greek' },
  { id: 'DE', label: 'German' },
  { id: 'FR', label: 'French' },
  { id: 'IT', label: 'Italian' },
  { id: 'ES', label: 'Spanish' },
  { id: 'PT', label: 'Portuguese' },
  { id: 'NL', label: 'Dutch' },
  { id: 'BE', label: 'Belgian' },
  { id: 'AT', label: 'Austrian' },
  { id: 'PL', label: 'Polish' },
  { id: 'RO', label: 'Romanian' },
  { id: 'BG', label: 'Bulgarian' },
  { id: 'CY', label: 'Cypriot' },
  { id: 'TR', label: 'Turkish' },
  { id: 'AL', label: 'Albanian' },
  { id: 'RS', label: 'Serbian' },
  { id: 'HR', label: 'Croatian' },
  { id: 'MK', label: 'North Macedonian' },
  { id: 'GB', label: 'British' },
  { id: 'IE', label: 'Irish' },
  { id: 'US', label: 'American' },
  { id: 'CA', label: 'Canadian' },
  { id: 'AU', label: 'Australian' },
  { id: 'IN', label: 'Indian' },
  { id: 'CN', label: 'Chinese' },
  { id: 'OTHER', label: 'Other' },
]);

export const NATIONALITY_IDS = Object.freeze(NATIONALITIES.map((n) => n.id));

/** Columns that must be filled before a booking request is accepted. */
export const PROFILE_REQUIRED_FIELDS = Object.freeze([
  'date_of_birth',
  'gender',
  'bio',
  'home_university',
  'receiving_university',
]);

const GENDER_SET = new Set(GENDERS);
const FUNDING_SET = new Set(FUNDING_SOURCES);
const UNIVERSITY_SET = new Set(UNIVERSITY_IDS);
const FACULTY_SET = new Set(RECEIVING_FACULTY_IDS);
const LANGUAGE_SET = new Set(LANGUAGE_IDS);
const NATIONALITY_SET = new Set(NATIONALITY_IDS);

/**
 * Free-text university name (home or receiving). Columns stay TEXT; legacy
 * controlled ids remain readable via universityLabel() when present.
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
export function validateUniversityText(raw) {
  if (raw == null || raw === '') {
    return { ok: true, value: null };
  }
  const value = normalizeSingleLine(raw);
  if (value == null) {
    return { ok: true, value: null };
  }
  return { ok: true, value };
}

/**
 * Parse YYYY-MM-DD (or full ISO) into a UTC calendar date, or null.
 * Rejects non-dates and impossible day/month combos.
 */
export function parseDateOfBirth(raw) {
  if (raw == null || raw === '') return null;
  const str = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

/**
 * Age in whole years as of `asOf` (default now, UTC day).
 * Returns null when DOB is missing/invalid.
 */
export function ageFromDateOfBirth(dob, asOf = new Date()) {
  const birth = dob instanceof Date ? dob : parseDateOfBirth(dob);
  if (!birth) return null;
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Validate DOB for storage: real calendar date, strictly in the past,
 * and student is at least MIN_AGE today.
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 *   value is YYYY-MM-DD when ok.
 */
export function validateDateOfBirth(raw, asOf = new Date()) {
  if (raw == null || raw === '') {
    return { ok: false, error: 'date_of_birth is required' };
  }
  const birth = parseDateOfBirth(raw);
  if (!birth) {
    return { ok: false, error: 'date_of_birth must be a real date (YYYY-MM-DD)' };
  }
  const today = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  if (birth.getTime() >= today.getTime()) {
    return { ok: false, error: 'date_of_birth must be in the past' };
  }
  const age = ageFromDateOfBirth(birth, asOf);
  if (age == null || age < MIN_AGE) {
    return { ok: false, error: `Student must be at least ${MIN_AGE}` };
  }
  // Sanity upper bound (no one born before 1900 on this platform).
  if (birth.getUTCFullYear() < 1900) {
    return { ok: false, error: 'date_of_birth is out of range' };
  }
  const yyyy = birth.getUTCFullYear();
  const mm = String(birth.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(birth.getUTCDate()).padStart(2, '0');
  return { ok: true, value: `${yyyy}-${mm}-${dd}` };
}

/**
 * Normalize languages to a deduped array of known language ids.
 * @returns {{ ok: true, value: string[] } | { ok: false, error: string }}
 */
export function validateLanguages(raw) {
  if (raw == null) {
    return { ok: true, value: [] };
  }
  let list = raw;
  if (typeof raw === 'string') {
    list = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(list)) {
    return { ok: false, error: 'languages must be an array' };
  }
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const id = typeof item === 'string' ? item.trim().toLowerCase() : '';
    if (!id) continue;
    if (!LANGUAGE_SET.has(id)) {
      return { ok: false, error: `unknown language: ${id}` };
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return { ok: true, value: out };
}

/**
 * Normalize + cap bio. Empty clears to null.
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
export function validateBio(raw) {
  if (raw == null || raw === '') {
    return { ok: true, value: null };
  }
  const normalized = normalizeMultiLine(raw);
  if (normalized == null) {
    return { ok: true, value: null };
  }
  if (codepointLength(normalized) > BIO_MAX_CHARS) {
    return {
      ok: false,
      error: `bio must be at most ${BIO_MAX_CHARS} characters`,
    };
  }
  return { ok: true, value: normalized };
}

function validateControlled(raw, set, fieldName) {
  if (raw == null || raw === '') {
    return { ok: true, value: null };
  }
  const v = normalizeSingleLine(raw);
  if (v == null) return { ok: true, value: null };
  if (!set.has(v)) {
    return { ok: false, error: `invalid ${fieldName}` };
  }
  return { ok: true, value: v };
}

/**
 * Parse a partial profile update body. Only keys present on `body` are
 * validated and returned. Use `requireComplete` to reject missing required
 * fields after merge with an existing row (booking gate).
 *
 * @param {Record<string, unknown>} body
 * @param {{ requireAllPresent?: boolean }} [opts]
 * @returns {{ ok: true, updates: Record<string, unknown> } | { ok: false, error: string, field?: string }}
 */
export function parseProfileUpdates(body, opts = {}) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }

  const updates = {};
  const requireAll = opts.requireAllPresent === true;

  if (body.date_of_birth !== undefined || requireAll) {
    if (body.date_of_birth === null || body.date_of_birth === '') {
      if (requireAll) {
        return { ok: false, error: 'date_of_birth is required', field: 'date_of_birth' };
      }
      updates.date_of_birth = null;
    } else if (body.date_of_birth !== undefined) {
      const r = validateDateOfBirth(body.date_of_birth);
      if (!r.ok) return { ok: false, error: r.error, field: 'date_of_birth' };
      updates.date_of_birth = r.value;
    }
  }

  if (body.gender !== undefined || requireAll) {
    if (requireAll && (body.gender == null || body.gender === '')) {
      return { ok: false, error: 'gender is required', field: 'gender' };
    }
    if (body.gender !== undefined) {
      const r = validateControlled(body.gender, GENDER_SET, 'gender');
      if (!r.ok) return { ok: false, error: r.error, field: 'gender' };
      updates.gender = r.value;
    }
  }

  // Optional legacy fields — still accepted if sent, never required for booking.
  if (body.nationality !== undefined) {
    if (body.nationality == null || body.nationality === '') {
      updates.nationality = null;
    } else {
      const raw = typeof body.nationality === 'string'
        ? body.nationality.trim().toUpperCase()
        : body.nationality;
      const r = validateControlled(raw, NATIONALITY_SET, 'nationality');
      if (!r.ok) return { ok: false, error: r.error, field: 'nationality' };
      updates.nationality = r.value;
    }
  }

  if (body.languages !== undefined) {
    const r = validateLanguages(body.languages);
    if (!r.ok) return { ok: false, error: r.error, field: 'languages' };
    updates.languages = r.value;
  }

  if (body.bio !== undefined || requireAll) {
    if (requireAll && (body.bio == null || body.bio === '')) {
      return { ok: false, error: 'bio is required', field: 'bio' };
    }
    if (body.bio !== undefined) {
      const r = validateBio(body.bio);
      if (!r.ok) return { ok: false, error: r.error, field: 'bio' };
      updates.bio = r.value;
    }
  }

  if (body.home_university !== undefined || requireAll) {
    if (requireAll && (body.home_university == null || body.home_university === '')) {
      return { ok: false, error: 'home_university is required', field: 'home_university' };
    }
    if (body.home_university !== undefined) {
      const r = validateUniversityText(body.home_university);
      if (!r.ok) return { ok: false, error: r.error, field: 'home_university' };
      if (requireAll && r.value == null) {
        return { ok: false, error: 'home_university is required', field: 'home_university' };
      }
      updates.home_university = r.value;
    }
  }

  if (body.receiving_university !== undefined || requireAll) {
    if (
      requireAll &&
      (body.receiving_university == null || body.receiving_university === '')
    ) {
      return {
        ok: false,
        error: 'receiving_university is required',
        field: 'receiving_university',
      };
    }
    if (body.receiving_university !== undefined) {
      const r = validateUniversityText(body.receiving_university);
      if (!r.ok) return { ok: false, error: r.error, field: 'receiving_university' };
      if (requireAll && r.value == null) {
        return {
          ok: false,
          error: 'receiving_university is required',
          field: 'receiving_university',
        };
      }
      updates.receiving_university = r.value;
    }
  }

  // Optional legacy fields — still accepted if sent, never required for booking.
  if (body.receiving_faculty !== undefined) {
    if (body.receiving_faculty == null || body.receiving_faculty === '') {
      updates.receiving_faculty = null;
    } else {
      const r = validateControlled(
        body.receiving_faculty,
        FACULTY_SET,
        'receiving_faculty',
      );
      if (!r.ok) return { ok: false, error: r.error, field: 'receiving_faculty' };
      updates.receiving_faculty = r.value;
    }
  }

  if (body.funding_source !== undefined) {
    if (body.funding_source == null || body.funding_source === '') {
      updates.funding_source = null;
    } else {
      const r = validateControlled(
        body.funding_source,
        FUNDING_SET,
        'funding_source',
      );
      if (!r.ok) return { ok: false, error: r.error, field: 'funding_source' };
      updates.funding_source = r.value;
    }
  }

  if (body.display_name !== undefined) {
    const name = normalizeSingleLine(body.display_name);
    if (name == null || name.length < 1) {
      return { ok: false, error: 'display_name is required', field: 'display_name' };
    }
    if (codepointLength(name) > 80) {
      return {
        ok: false,
        error: 'display_name must be at most 80 characters',
        field: 'display_name',
      };
    }
    updates.display_name = name;
  }

  return { ok: true, updates };
}

/**
 * Which required profile fields are still empty on a student row.
 * @param {Record<string, unknown>|null|undefined} student
 * @returns {string[]}
 */
export function missingProfileFields(student) {
  if (!student) return [...PROFILE_REQUIRED_FIELDS];
  const missing = [];
  for (const field of PROFILE_REQUIRED_FIELDS) {
    const v = student[field];
    if (field === 'languages') {
      if (!Array.isArray(v) || v.length === 0) missing.push(field);
      continue;
    }
    if (v == null || v === '') missing.push(field);
  }
  return missing;
}

export function isProfileComplete(student) {
  return missingProfileFields(student).length === 0;
}

/**
 * Completeness ratio 0..1 for UI meters.
 */
export function profileCompleteness(student) {
  const total = PROFILE_REQUIRED_FIELDS.length;
  if (total === 0) return 1;
  const missing = missingProfileFields(student).length;
  return (total - missing) / total;
}

/** Columns selected for guest profile (landlord-safe — no email/contact). */
export const GUEST_PROFILE_SELECT =
  'student_id, display_name, date_of_birth, gender, nationality, languages, bio, home_university, receiving_university, receiving_faculty, funding_source, created_at';

/** Full student self-view columns. */
export const STUDENT_PROFILE_SELECT =
  'student_id, email, display_name, preferred_locale, date_of_birth, gender, nationality, languages, bio, home_university, receiving_university, receiving_faculty, funding_source, created_at, updated_at';

/**
 * Shape a student row for a landlord-facing booking response.
 * Never includes email or other contact details. Adds derived `age`.
 */
export function toGuestProfile(student) {
  if (!student) return null;
  const dob = student.date_of_birth ?? null;
  return {
    student_id: student.student_id,
    display_name: student.display_name ?? null,
    date_of_birth: dob,
    age: ageFromDateOfBirth(dob),
    gender: student.gender ?? null,
    nationality: student.nationality ?? null,
    languages: Array.isArray(student.languages) ? student.languages : [],
    bio: student.bio ?? null,
    home_university: student.home_university ?? null,
    receiving_university: student.receiving_university ?? null,
    receiving_faculty: student.receiving_faculty ?? null,
    funding_source: student.funding_source ?? null,
    created_at: student.created_at ?? null,
  };
}

export function universityLabel(id) {
  return UNIVERSITIES.find((u) => u.id === id)?.label ?? id ?? null;
}

export function facultyLabel(id) {
  return RECEIVING_FACULTIES.find((f) => f.id === id)?.label ?? id ?? null;
}

export function languageLabel(id) {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id ?? null;
}

export function nationalityLabel(id) {
  return NATIONALITIES.find((n) => n.id === id)?.label ?? id ?? null;
}
