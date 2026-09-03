import {
  MIN_PHOTOS,
  parseAndValidateDurations,
  validateRequiredCoords,
  validateUniversityDistancesMandatory,
} from '@/lib/listingWizardRules';

/*
  The listing editor's sections — parity Feature 51.

  Feature 51 keeps the guided wizard for CREATE (a linear order genuinely
  helps a first-time landlord) and replaces it with a SECTION LIST for EDIT:
  each section opens in place, in any order.

  The point is not the layout. It is that a section list has a landing point
  and a wizard does not: Feature 50's action-required banner deep-links
  straight to the one incomplete section, and a linear flow can only restart
  itself. `firstIncompleteSection` below is what the banner will call.

  WHERE THIS DEVIATES FROM THE SPEC'S SECTION LIST, AND WHY.

  The spec names: Photos · Title & description · Price & terms · Address ·
  Amenities · Availability. That list is derived from Airbnb's edit view, and
  two things do not carry over:

  1. `Title & description` and `Amenities` are ONE section here, not two.
     Both live in the same form region (`StepProperty`) and the same save.
     Splitting them in the UI while they share a component would mean either
     rendering that component twice with half its fields hidden, or cutting it
     in two for presentational reasons alone. Neither earns its cost.

  2. `Universities` is added, and the spec could not have known to ask for it.
     Commute distance to a faculty is the product's differentiator and is
     MANDATORY (`validateUniversityDistancesMandatory`); Airbnb has no
     equivalent, so its section list has no slot for it. Omitting it would
     leave a required field with no home in the editor.

  Six sections either way.
*/

/**
 * Section order. Photos first because it is the section a landlord most often
 * returns to, and the one whose absence most often blocks go-live.
 *
 * `step` is the wizard step key the section renders, so the two editors stay
 * one set of components rather than two.
 */
export const LISTING_SECTIONS = [
  { key: 'photos', step: 'photos' },
  { key: 'property', step: 'property' },
  { key: 'price', step: 'price' },
  { key: 'address', step: 'address' },
  { key: 'universities', step: 'universities' },
  { key: 'availability', step: 'availability' },
];

/** Section keys, in order. */
export const SECTION_KEYS = LISTING_SECTIONS.map((s) => s.key);

function photoCount(form) {
  const uploaded = Array.isArray(form?.photos) ? form.photos.length : 0;
  const external = Array.isArray(form?.external_photo_urls)
    ? form.external_photo_urls.length
    : 0;
  return uploaded + external;
}

/**
 * Is each section complete enough to publish?
 *
 * Delegates to `listingWizardRules` wherever a rule already exists, so the
 * editor and the wizard cannot disagree about the same listing. A section with
 * no rule is complete when its required field is non-empty.
 *
 * Pure — exported for unit testing.
 *
 * @param {object|null} form  the wizard's form state
 * @returns {Record<string, boolean>} keyed by section, true = complete
 */
export function sectionCompleteness(form) {
  const f = form || {};
  return {
    /*
      Deliberately the MINIMUM only, not the full validator.
      `validatePhotoMinimum` also rejects going over PHOTO_LIMIT, and folding
      that in here labels a listing with too many photos "Needs details" —
      which reads as "add more" and sends the landlord the wrong way. Being
      over the cap is a save-time error with its own message, not an
      unfinished section. Found on a live listing carrying 23 photos.
    */
    photos: photoCount(f) >= MIN_PHOTOS,
    property: Boolean(
      String(f.title || '').trim() &&
        String(f.description || '').trim() &&
        f.property_type,
    ),
    price: Number(f.monthly_price) > 0,
    address: Boolean(
      String(f.address || '').trim() &&
        String(f.neighborhood || '').trim() &&
        validateRequiredCoords(f.lat, f.lng).ok,
    ),
    universities: validateUniversityDistancesMandatory(f.university_distances).ok,
    /*
      `parseAndValidateDurations` returns `{ min, max }` on success and
      `{ error, code }` on failure — it has NO `.ok`, unlike its neighbours in
      the same module. Checking for `.ok` here made every listing permanently
      incomplete on this section, which the tests caught.
    */
    availability: Boolean(
      f.available_from &&
        !parseAndValidateDurations(f.min_duration_months, f.max_duration_months).error,
    ),
  };
}

/**
 * The section a landlord should be sent to first.
 *
 * Returns the first INCOMPLETE section in display order, or null when nothing
 * is outstanding. Order matters: this is the banner's deep-link target, and
 * sending someone to the third missing thing when the first is also missing
 * wastes the click.
 *
 * @param {object|null} form
 * @returns {string|null} section key
 */
export function firstIncompleteSection(form) {
  const done = sectionCompleteness(form);
  return SECTION_KEYS.find((key) => !done[key]) ?? null;
}

/**
 * How many sections still need something.
 * @param {object|null} form
 * @returns {{ total: number, complete: number, incomplete: number }}
 */
export function sectionProgress(form) {
  const done = sectionCompleteness(form);
  const complete = SECTION_KEYS.filter((k) => done[k]).length;
  return {
    total: SECTION_KEYS.length,
    complete,
    incomplete: SECTION_KEYS.length - complete,
  };
}

/**
 * One line describing what is currently set, for the collapsed row.
 *
 * Returns a message KEY plus params rather than copy, so next-intl stays the
 * only place strings live. `null` means "nothing set yet" and the caller
 * renders its own empty line.
 *
 * @param {object|null} form
 * @param {string} key section key
 * @returns {{ key: string, params: object }|null}
 */
export function sectionSummary(form, key) {
  const f = form || {};
  switch (key) {
    case 'photos': {
      const n = photoCount(f);
      return n > 0 ? { key: 'summaryPhotos', params: { count: n } } : null;
    }
    case 'property':
      return f.title ? { key: 'summaryText', params: { text: f.title } } : null;
    case 'price':
      return Number(f.monthly_price) > 0
        ? { key: 'summaryPrice', params: { price: Number(f.monthly_price) } }
        : null;
    case 'address':
      return f.address ? { key: 'summaryText', params: { text: f.address } } : null;
    case 'universities': {
      const rows = Array.isArray(f.university_distances) ? f.university_distances : [];
      return rows.length > 0 ? { key: 'summaryUniversities', params: { count: rows.length } } : null;
    }
    case 'availability':
      return f.available_from
        ? { key: 'summaryText', params: { text: f.available_from } }
        : null;
    default:
      return null;
  }
}

export { MIN_PHOTOS };
