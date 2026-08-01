/**
 * OpenStreetMap Nominatim client for the landlord address step.
 * Policy: https://operations.osmfoundation.org/policies/nominatim/
 *   - Descriptive User-Agent
 *   - Max 1 request/second (enforced by caller debounce)
 *   - No bulk scraping
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'StudentX-LandlordWizard/1.0 (https://studentx.uk; listings@studentx.uk)';

/**
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<Array<{
 *   display_name: string,
 *   lat: number,
 *   lng: number,
 *   address: object
 * }>>}
 */
export async function searchAddress(query, opts = {}) {
  const q = (query || '').trim();
  if (q.length < 3) return [];

  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'gr');
  // Bias toward Thessaloniki
  url.searchParams.set('viewbox', '22.80,40.70,23.05,40.55');
  url.searchParams.set('bounded', '0');

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    display_name: row.display_name,
    lat: Number(row.lat),
    lng: Number(row.lon),
    address: row.address || {},
  }));
}

/**
 * Reverse-geocode a pin to a structured address (best-effort).
 */
export async function reverseGeocode(lat, lng, opts = {}) {
  const url = new URL(`${NOMINATIM}/reverse`);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: opts.signal,
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.error) return null;
  return {
    display_name: data.display_name,
    address: data.address || {},
  };
}

/**
 * Build a street-address line from Nominatim address parts.
 */
export function formatStreetAddress(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const number = addr.house_number || '';
  const road = addr.road || addr.pedestrian || addr.footway || addr.path || '';
  if (road && number) return `${road} ${number}`;
  if (road) return road;
  return addr.suburb || addr.neighbourhood || addr.city_district || '';
}
