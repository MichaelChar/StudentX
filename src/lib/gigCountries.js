// Single source of truth for the countries the Holiday Gigs vertical can
// surface, plus the map metadata each one needs. Mirrors the role cityRoutes.js
// plays for the property directory.
//
// The country FILTER on /gigs/results is data-driven: /api/gigs/countries
// returns the country codes that currently have at least one active gig, and the
// UI renders a button for each — looked up here for its display name, flag and
// map centre. So "adding a country" means: add an entry here AND seed gigs with
// that country_code. A code present on gigs but missing here is ignored by the
// filter (no metadata to render), which keeps the UI from showing a bare code.

export const GIG_COUNTRIES = [
  {
    code: 'GR',
    name: 'Greece',
    flag: '🇬🇷',
    center: [39.0742, 21.8243],
    zoom: 6,
  },
  {
    code: 'ES',
    name: 'Spain',
    flag: '🇪🇸',
    center: [40.4637, -3.7492],
    zoom: 5,
  },
  {
    code: 'UK',
    name: 'United Kingdom',
    flag: '🇬🇧',
    center: [54.0, -2.5],
    zoom: 5,
  },
  {
    code: 'IT',
    name: 'Italy',
    flag: '🇮🇹',
    center: [41.8719, 12.5674],
    zoom: 5,
  },
  {
    code: 'FR',
    name: 'France',
    flag: '🇫🇷',
    center: [46.2276, 2.2137],
    zoom: 5,
  },
  {
    code: 'CH',
    name: 'Switzerland',
    flag: '🇨🇭',
    center: [46.8182, 8.2275],
    zoom: 7,
  },
];

const BY_CODE = new Map(GIG_COUNTRIES.map((c) => [c.code, c]));

/** Look up a country's display metadata by ISO-2 code (null if unknown). */
export function getGigCountry(code) {
  return BY_CODE.get(code) ?? null;
}

/** Whether a code has display metadata (and so can render a filter button). */
export function isKnownGigCountry(code) {
  return BY_CODE.has(code);
}

// Map view defaults to roughly all of Europe so pins across countries are
// visible before the student picks a country.
export const GIGS_MAP_DEFAULT_CENTER = [48.0, 9.0];
export const GIGS_MAP_DEFAULT_ZOOM = 4;
