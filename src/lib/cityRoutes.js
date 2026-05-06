// Single source of truth for the cities StudentX serves and the URL helpers
// for routing between them.
//
// Cities have one of two statuses:
//   - 'live': a real directory exists at /property/<slug> (full Propylaea
//     landing + listings + quiz + landlord auth tree)
//   - 'coming-soon': /property/<slug> resolves to a placeholder page; the
//     city is on the hub diagram so users can express interest, but no
//     directory data exists yet
//
// `SUPPORTED_CITIES` is the union — anything not in the list 404s via the
// city layout's notFound() check. Adding a real city: flip its status to
// 'live' and ship the seed data + listings.
//
// The hub at /property reads `COUNTRIES` directly to render its
// neural-net diagram, so this is also the layout source for the hub.

export const COUNTRIES = [
  {
    code: 'GR',
    name: 'Greece',
    flag: '🇬🇷',
    cities: [
      { slug: 'thessaloniki', name: 'Thessaloniki', accent: 'thessaloniki', status: 'live' },
      { slug: 'athens', name: 'Athens', accent: 'athens', status: 'coming-soon' },
      { slug: 'larissa', name: 'Larissa', accent: 'larissa', status: 'coming-soon' },
      { slug: 'heraklion', name: 'Heraklion', accent: 'heraklion', status: 'coming-soon' },
    ],
  },
  {
    code: 'CY',
    name: 'Cyprus',
    flag: '🇨🇾',
    cities: [
      { slug: 'nicosia', name: 'Nicosia', accent: 'london', status: 'coming-soon' },
    ],
  },
  {
    code: 'UK',
    name: 'United Kingdom',
    flag: '🇬🇧',
    cities: [
      { slug: 'london', name: 'London', accent: 'london', status: 'coming-soon' },
    ],
  },
  {
    code: 'IE',
    name: 'Ireland',
    flag: '🇮🇪',
    cities: [
      { slug: 'dublin', name: 'Dublin', accent: 'london', status: 'coming-soon' },
    ],
  },
];

// City accent palettes — used by the hub's hover/active treatment and by
// the per-city coming-soon page hero. Keys match `accent` on each city.
export const CITY_ACCENTS = {
  thessaloniki: { bg: '#FFE8DC', ink: '#C24A1F', name: 'Coral' },
  athens: { bg: '#E8EEFF', ink: '#3148A8', name: 'Marble blue' },
  larissa: { bg: '#E6F2E6', ink: '#2F6B3A', name: 'Plain green' },
  heraklion: { bg: '#FFF4D6', ink: '#A87015', name: 'Sun ochre' },
  london: { bg: '#EAE3F2', ink: '#5B3A8A', name: 'Royal plum' },
};

// Flat list of every supported city, with country backreference.
export const ALL_CITIES = COUNTRIES.flatMap((country) =>
  country.cities.map((city) => ({ ...city, country })),
);

export const SUPPORTED_CITIES = ALL_CITIES.map((c) => c.slug);
export const LIVE_CITIES = ALL_CITIES.filter((c) => c.status === 'live').map((c) => c.slug);

export const DEFAULT_CITY = 'thessaloniki';

export function getCity(slug) {
  return ALL_CITIES.find((c) => c.slug === slug) || null;
}

export function isSupportedCity(slug) {
  return typeof slug === 'string' && SUPPORTED_CITIES.includes(slug);
}

export function isLiveCity(slug) {
  return typeof slug === 'string' && LIVE_CITIES.includes(slug);
}

// Build a /property/<city>/<subpath> href. subpath can be '' for the city
// landing, or '/results', '/landlord/login', etc.
export function propertyHref(city, subpath = '') {
  return `/property/${city}${subpath}`;
}
