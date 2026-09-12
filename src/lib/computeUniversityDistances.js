/**
 * Measure a listing's distance to each university from its lat/lng.
 *
 * Reuses the same OSRM foot /table + metre annotation that
 * recomputeDistances uses for faculty_distances, then collapses
 * faculties to their parent university and keeps the nearest campus.
 *
 * University short codes on faculties (AUTH / UoM / IHU) map onto
 * universities.university_id (auth / uom / ihu).
 *
 * TWO POSITION SOURCES, IN THIS ORDER (migration 119)
 * ---------------------------------------------------
 * 1. `faculties` — preferred. Nearest campus beats a centroid for a
 *    university taught across many sites (AUTH has 13, out to Thermi).
 * 2. `universities.lat/lng` — for universities with no faculty rows.
 *    Prod holds faculties for AUTH only, so without this UoM and IHU are
 *    simply unmeasurable and the landlord wizard's read-only step has
 *    nothing to show for them.
 *
 * A university present in both is measured from its faculties; the
 * university row's own coordinates are never consulted for it.
 */

const OSRM_BASE = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 15_000;

const UNI_CODE_TO_ID = {
  AUTH: 'auth',
  UOM: 'uom',
  IHU: 'ihu',
};

/**
 * Haversine distance in metres — used as a fallback when OSRM is
 * unreachable, so the wizard still shows a measurement rather than
 * "Not measured" for every university.
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Map faculty.university free text → universities.university_id.
 * @param {string} code
 * @returns {string|null}
 */
export function universityCodeToId(code) {
  if (!code || typeof code !== 'string') return null;
  const key = code.trim().toUpperCase().replace(/\s+/g, '');
  // "University of Macedonia" style names aren't expected on faculty rows;
  // the seeded column is the short code. Still accept common variants.
  if (UNI_CODE_TO_ID[key]) return UNI_CODE_TO_ID[key];
  if (key === 'UOM' || key.includes('MACEDONIA')) return 'uom';
  if (key === 'AUTH' || key.includes('ARISTOTLE')) return 'auth';
  if (key === 'IHU' || key.includes('HELLENIC')) return 'ihu';
  return null;
}

/**
 * Collapse a list of { university_id, distance_meters } rows, keeping
 * the minimum distance per university.
 * @param {Array<{ university_id: string, distance_meters: number }>} rows
 */
export function collapseNearestPerUniversity(rows) {
  const best = new Map();
  for (const row of rows) {
    if (!row?.university_id || !Number.isFinite(row.distance_meters)) continue;
    const meters = Math.max(1, Math.round(row.distance_meters));
    const prev = best.get(row.university_id);
    if (prev == null || meters < prev) best.set(row.university_id, meters);
  }
  return [...best.entries()]
    .map(([university_id, distance_meters]) => ({
      university_id,
      distance_meters,
      source: 'computed',
    }))
    .sort((a, b) => a.distance_meters - b.distance_meters);
}

/**
 * Compute university distances for a single pin.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ faculty_id: string, university: string, lat: number, lng: number }>} faculties
 * @param {{ fetchImpl?: typeof fetch, useOsrm?: boolean, universities?: Array<{ university_id: string, lat: unknown, lng: unknown }> }} [opts]
 *   `universities` carries the migration-119 fallback coordinates; a university
 *   with faculty rows ignores them.
 * @returns {Promise<Array<{ university_id: string, distance_meters: number, source: 'computed' }>>}
 */
export async function computeUniversityDistances(origin, faculties, opts = {}) {
  const lat = Number(origin?.lat);
  const lng = Number(origin?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }

  const usable = (faculties || [])
    .map((f) => ({
      faculty_id: f.faculty_id,
      university_id: universityCodeToId(f.university),
      lat: Number(f.lat),
      lng: Number(f.lng),
    }))
    .filter(
      (f) =>
        f.university_id &&
        Number.isFinite(f.lat) &&
        Number.isFinite(f.lng),
    );

  // Universities with no faculty row of their own, measured from the campus
  // point on `universities` instead. Keyed as a pseudo-faculty so they ride the
  // same OSRM table call rather than a second round trip.
  const covered = new Set(usable.map((f) => f.university_id));
  for (const u of opts.universities || []) {
    const id = u?.university_id;
    if (typeof id !== 'string' || !id || covered.has(id)) continue;
    // Number(null) is 0, so a row with no coordinates would otherwise be
    // measured against Null Island and reported as a real distance.
    if (u.lat == null || u.lng == null || u.lat === '' || u.lng === '') continue;
    const uLat = Number(u.lat);
    const uLng = Number(u.lng);
    if (!Number.isFinite(uLat) || !Number.isFinite(uLng)) continue;
    covered.add(id);
    usable.push({
      faculty_id: `university:${id}`,
      university_id: id,
      lat: uLat,
      lng: uLng,
    });
  }

  if (usable.length === 0) return [];

  const useOsrm = opts.useOsrm !== false;
  const fetchImpl = opts.fetchImpl || fetch;

  if (useOsrm) {
    try {
      const coordsParts = [
        `${lng},${lat}`,
        ...usable.map((f) => `${f.lng},${f.lat}`),
      ];
      const sourcesParam = '0';
      const destinationsParam = usable.map((_, i) => i + 1).join(';');
      const tableUrl =
        `${OSRM_BASE}/table/v1/foot/${coordsParts.join(';')}` +
        `?sources=${sourcesParam}` +
        `&destinations=${destinationsParam}` +
        `&annotations=distance`;

      const res = await fetchImpl(tableUrl, {
        headers: { 'user-agent': 'StudentX-landlord-wizard/1.0' },
        signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
      });
      if (res.ok) {
        const table = await res.json();
        if (table?.code === 'Ok' && Array.isArray(table.distances?.[0])) {
          const row = table.distances[0];
          const pairs = usable
            .map((f, i) => {
              const d = row[i];
              if (d == null || !Number.isFinite(Number(d))) return null;
              return {
                university_id: f.university_id,
                distance_meters: Number(d),
              };
            })
            .filter(Boolean);
          if (pairs.length > 0) return collapseNearestPerUniversity(pairs);
        }
      }
    } catch {
      // fall through to haversine
    }
  }

  // Fallback: straight-line metres. Same unit the listing stores, and still
  // source=computed — the landlord cannot type over either one.
  const pairs = usable.map((f) => ({
    university_id: f.university_id,
    distance_meters: haversineMeters(lat, lng, f.lat, f.lng),
  }));
  return collapseNearestPerUniversity(pairs);
}
