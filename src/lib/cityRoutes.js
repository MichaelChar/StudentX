// Single source of truth for the cities StudentX serves and the URL helpers
// for routing between them.
//
// Phase 1 (current) only ships Thessaloniki. Phase 2 adds the city schema in
// the database; this module gains entries when each new city goes live.
// Anything routing-aware (the [city] layout's notFound check, middleware
// redirects from old single-city URLs, links built from components) reads
// from here so adding a city is a single-list edit plus its translations.

export const SUPPORTED_CITIES = ['thessaloniki'];

export const DEFAULT_CITY = 'thessaloniki';

export function isSupportedCity(slug) {
  return typeof slug === 'string' && SUPPORTED_CITIES.includes(slug);
}

// Build a /property/<city>/<subpath> href. subpath can be '' for the city
// landing, or '/results', '/landlord/login', etc.
export function propertyHref(city, subpath = '') {
  return `/property/${city}${subpath}`;
}
