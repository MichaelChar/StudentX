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
  { value: 'semester-7', label: 'Semester 7' },
  { value: 'semester-8', label: 'Semester 8' },
  { value: 'semester-9', label: 'Semester 9' },
  { value: 'semester-10', label: 'Semester 10' },
  { value: 'semester-11', label: 'Semester 11' },
  { value: 'semester-12', label: 'Semester 12' },
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

/**
 * Derive a human label for a subject slug coming from a content path.
 * Examples: "anatomy-1" → "Anatomy I", "general-histology" → "General Histology",
 * "biochemistry" → "Biochemistry I" (override for source fidelity).
 * Used for subject facet pills, grouping headers, and search.
 */
export function getSubjectLabel(slug) {
  if (typeof slug !== 'string' || !slug) return '';
  const overrides = {
    'anatomy-1': 'Anatomy I',
    'biochemistry': 'Biochemistry I',
  };
  if (overrides[slug]) return overrides[slug];
  return slug
    .split('-')
    .map((part) => {
      const m = part.match(/^(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        const romans = [null, 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
        if (n > 0 && n < romans.length) return romans[n];
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}
