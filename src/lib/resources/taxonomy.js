/**
 * Controlled vocabularies for the /resources hub facets (Resource type,
 * Semester, Country). Single source of truth — the generator
 * (scripts/generate-resources-manifest.mjs) validates every content entry
 * against these enums and fails the build if a value isn't listed here.
 *
 * "Country" means the country of the medical curriculum a resource follows
 * (e.g. AUSoM follows the Greek curriculum), NOT the school's location.
 */

/** @typedef {{ value: string, label: string }} TaxonomyValue */

/** @type {TaxonomyValue[]} */
export const RESOURCE_TYPES = [
  { value: 'practice-test', label: 'Practice test' },
  { value: 'flashcard-deck', label: 'Flashcard deck' },
  { value: 'past-paper', label: 'Past paper' },
  { value: 'study-notes', label: 'Study notes' },
];

/** @type {TaxonomyValue[]} */
export const SEMESTERS = [
  { value: 'semester-1', label: 'Semester 1' },
  { value: 'semester-2', label: 'Semester 2' },
  { value: 'semester-3', label: 'Semester 3' },
  { value: 'semester-4', label: 'Semester 4' },
  { value: 'semester-5', label: 'Semester 5' },
  { value: 'semester-6', label: 'Semester 6' },
];

/** @type {TaxonomyValue[]} */
export const COUNTRIES = [{ value: 'gr', label: 'Greek curriculum' }];

// Year isn't a fixed enum like the facets above — it's the exam/curriculum
// year a resource targets (e.g. 2026), and a new one is added every year.
// Bounds only, so the generator still fails loudly on an out-of-range typo
// (e.g. a 4-digit-year transposition).
export const MIN_YEAR = 2020;
export const MAX_YEAR = 2100;

/** @param {TaxonomyValue[]} list */
function toValueSet(list) {
  return new Set(list.map((v) => v.value));
}

/** @param {TaxonomyValue[]} list */
function toLabelMap(list) {
  return Object.fromEntries(list.map((v) => [v.value, v.label]));
}

export const RESOURCE_TYPE_VALUES = toValueSet(RESOURCE_TYPES);
export const SEMESTER_VALUES = toValueSet(SEMESTERS);
export const COUNTRY_VALUES = toValueSet(COUNTRIES);

export const RESOURCE_TYPE_LABELS = toLabelMap(RESOURCE_TYPES);
export const SEMESTER_LABELS = toLabelMap(SEMESTERS);
export const COUNTRY_LABELS = toLabelMap(COUNTRIES);

export const isValidResourceType = (value) => RESOURCE_TYPE_VALUES.has(value);
export const isValidSemester = (value) => SEMESTER_VALUES.has(value);
export const isValidCountry = (value) => COUNTRY_VALUES.has(value);
export const isValidYear = (value) => Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR;
