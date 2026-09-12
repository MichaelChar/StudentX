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

  // faculty index → OSRM metres, for the destinations OSRM could route to.
  const routed = new Map();

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
          usable.forEach((_, i) => {
            const d = row[i];
            if (d == null || !Number.isFinite(Number(d))) return;
            routed.set(i, Number(d));
          });
        }
      }
    } catch {
      // fall through to haversine for everything
    }
  }

  /*
    PER-UNIVERSITY, NOT PER-TABLE (the hole this closes).

    OSRM can return a table where SOME destinations are null — a campus point
    with no routable way near it, typically. This used to drop those rows and
    return whatever routed, because `pairs.length > 0` was enough to skip the
    haversine fallback entirely. One unroutable campus therefore made a
    university silently vanish from the result: the wizard rendered it as
    "Not measured", and below two measured universities the step refused to
    continue — all with the canary green, since the canary measures with
    useOsrm:false and never sees OSRM's nulls.

    So the decision is made per university:
      - any routable campus  → the nearest ROUTED distance (ignore that
        university's haversine values, which are always shorter and would
        win a naive min())
      - none routable        → the nearest straight-line distance

    Both are reported as source='computed'. A result can therefore mix routed
    and straight-line rows; that is the intended trade. A straight-line number
    is an understatement of the walk, but it is a measurement the student can
    reason about, and it beats the alternative of showing nothing for a
    university that plainly exists.
  */
  const byUniversity = new Map();
  usable.forEach((f, i) => {
    const entry = byUniversity.get(f.university_id) || { routed: [], straight: [] };
    if (routed.has(i)) entry.routed.push(routed.get(i));
    else entry.straight.push(haversineMeters(lat, lng, f.lat, f.lng));
    byUniversity.set(f.university_id, entry);
  });

  const pairs = [];
  for (const [universityId, entry] of byUniversity) {
    const candidates = entry.routed.length > 0 ? entry.routed : entry.straight;
    if (candidates.length === 0) continue;
    pairs.push({
      university_id: universityId,
      distance_meters: Math.min(...candidates),
    });
  }

  return collapseNearestPerUniversity(pairs);
}
