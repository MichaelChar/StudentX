import { getSupabase } from '@/lib/supabase';

// Computes any missing rows in `faculty_distances` for the given listings (or
// every listing if `listingIds` is omitted) and upserts them. Idempotent — only
// fills gaps, so a fully-populated DB is a no-op (cheap DB read, no OSRM call).
//
// Used by:
//   1. /api/cron/recompute-distances   — full sweep, daily at 09:15 UTC.
//   2. /api/landlord/listings POST     — single-listing call after create.
//   3. /api/landlord/listings/[id]     — single-listing call after edit.
//
// Pace model is intentionally identical to scripts/compute_distances.py so
// rows produced here are indistinguishable from rows the manual script
// produces. Keep the constants in sync with that file when tweaking.
//
// faculty_distances has no RLS (see supabase/migrations/001_create_schema.sql
// and 005_listings_rls.sql — RLS is enabled per-table; faculty_distances is
// not in either list), so the anon client returned by getSupabase() can read
// AND write. We deliberately do NOT introduce a service-role client here —
// the Worker doesn't have SUPABASE_SERVICE_ROLE_KEY in its vars.

const WALK_M_PER_MIN = 83;       // 5 km/h walking pace
const BUS_M_PER_MIN = 250;       // ~15 km/h average bus speed incl. stops
const BUS_OVERHEAD_MIN = 5;      // avg wait + walk-to/from-stop

const OSRM_BASE = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 15_000;

// OSRM /table imposes a per-call coordinate limit (~100 on the public demo).
// With ~50 listings and ~13 faculties we're at 63 points worst case for a
// full sweep. Single-listing calls from create/edit are always 1 + 13 = 14.
const OSRM_MAX_COORDS = 100;

// distance_m -> (walk_minutes, transit_minutes) using the pace model above.
// Mirrors compute_minutes() in scripts/compute_distances.py.
function distanceToMinutes(distanceM) {
  const walk = Math.max(1, Math.ceil(distanceM / WALK_M_PER_MIN));
  const transit = Math.ceil(distanceM / BUS_M_PER_MIN) + BUS_OVERHEAD_MIN;
  return { walk, transit };
}

export async function recomputeMissingDistances({ listingIds } = {}) {
  const supabase = getSupabase();

  // 1. Fetch listings (with their location lat/lng) and faculties.
  //    location is INNER-joined: a listing without a location row can't be
  //    routed, and the FK guarantees one exists. Listings whose location has
  //    null lat/lng (allowed since migration 014) are filtered out below —
  //    we can't route from a null coordinate.
  let listingsQuery = supabase
    .from('listings')
    .select('listing_id, location!inner ( lat, lng )');
  if (Array.isArray(listingIds) && listingIds.length > 0) {
    listingsQuery = listingsQuery.in('listing_id', listingIds);
  }
  const { data: listingRows, error: listingsErr } = await listingsQuery;
  if (listingsErr) {
    console.error('[recomputeMissingDistances] failed to fetch listings:', listingsErr);
    return { ok: false, reason: `fetch listings: ${listingsErr.message || listingsErr}` };
  }

  const listings = (listingRows || [])
    .map((row) => {
      const lat = row?.location?.lat;
      const lng = row?.location?.lng;
      if (lat == null || lng == null) return null;
      return {
        listing_id: row.listing_id,
        lat: Number(lat),
        lng: Number(lng),
      };
    })
    .filter(Boolean);

  const { data: facultyRows, error: facultiesErr } = await supabase
    .from('faculties')
    .select('faculty_id, lat, lng');
  if (facultiesErr) {
    console.error('[recomputeMissingDistances] failed to fetch faculties:', facultiesErr);
    return { ok: false, reason: `fetch faculties: ${facultiesErr.message || facultiesErr}` };
  }

  const faculties = (facultyRows || [])
    .map((row) => ({
      faculty_id: row.faculty_id,
      lat: Number(row.lat),
      lng: Number(row.lng),
    }))
    .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));

  if (listings.length === 0 || faculties.length === 0) {
    return {
      ok: true,
      computed: 0,
      missingBefore: 0,
      listings: listings.length,
      faculties: faculties.length,
    };
  }

  // 2. Pull existing pairs for the listings we're considering and figure out
  //    what's missing. Page through to avoid Supabase's default 1000-row cap.
  const existingPairs = new Set();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let pageQuery = supabase
      .from('faculty_distances')
      .select('listing_id, faculty_id')
      .range(from, from + PAGE - 1);
    if (Array.isArray(listingIds) && listingIds.length > 0) {
      pageQuery = pageQuery.in('listing_id', listingIds);
    }
    const { data: pageRows, error: existingErr } = await pageQuery;
    if (existingErr) {
      console.error('[recomputeMissingDistances] failed to fetch existing pairs:', existingErr);
      return { ok: false, reason: `fetch faculty_distances: ${existingErr.message || existingErr}` };
    }
    if (!pageRows || pageRows.length === 0) break;
    for (const row of pageRows) {
      existingPairs.add(`${row.listing_id}|${row.faculty_id}`);
    }
    if (pageRows.length < PAGE) break;
    from += PAGE;
  }

  // 3. Build the list of missing (listing, faculty) pairs.
  const missing = [];
  for (const l of listings) {
    for (const f of faculties) {
      if (!existingPairs.has(`${l.listing_id}|${f.faculty_id}`)) {
        missing.push({ listing: l, faculty: f });
      }
    }
  }

  if (missing.length === 0) {
    return {
      ok: true,
      computed: 0,
      missingBefore: 0,
      listings: listings.length,
      faculties: faculties.length,
    };
  }

  // 4. Build the OSRM /table call. We pack listings first, then faculties,
  //    into a single deduped coordinate list so each unique point appears
  //    once. `sources` indexes the listings, `destinations` indexes the
  //    faculties. OSRM returns a sources×destinations distance matrix.
  const totalCoords = listings.length + faculties.length;
  if (totalCoords > OSRM_MAX_COORDS) {
    console.error(
      `[recomputeMissingDistances] coord count ${totalCoords} exceeds OSRM /table limit ${OSRM_MAX_COORDS}; batching not yet implemented`,
    );
    return {
      ok: false,
      reason: `coord count ${totalCoords} > ${OSRM_MAX_COORDS}; batching needed`,
    };
  }

  // OSRM expects "lng,lat;lng,lat;..." — the lng/lat order is correct.
  const coordsParts = [
    ...listings.map((l) => `${l.lng},${l.lat}`),
    ...faculties.map((f) => `${f.lng},${f.lat}`),
  ];
  const sourcesParam = listings.map((_, i) => i).join(';');
  const destinationsParam = faculties.map((_, i) => listings.length + i).join(';');

  const tableUrl =
    `${OSRM_BASE}/table/v1/foot/${coordsParts.join(';')}` +
    `?sources=${sourcesParam}` +
    `&destinations=${destinationsParam}` +
    `&annotations=distance`;

  let table;
  try {
    const res = await fetch(tableUrl, {
      headers: { 'user-agent': 'StudentX-recompute-distances/1.0' },
      signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(
        `[recomputeMissingDistances] OSRM /table HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
      return { ok: false, reason: `OSRM /table HTTP ${res.status}` };
    }
    table = await res.json();
  } catch (err) {
    console.error('[recomputeMissingDistances] OSRM /table threw:', err);
    return { ok: false, reason: `OSRM /table fetch: ${err.message || err.name || 'unknown'}` };
  }

  if (table?.code !== 'Ok' || !Array.isArray(table.distances)) {
    console.error('[recomputeMissingDistances] OSRM /table unexpected payload:', table?.code);
    return { ok: false, reason: `OSRM /table code: ${table?.code || 'unknown'}` };
  }

  // table.distances is [sources][destinations] in metres (or null if no
  // route). Sources align with `listings`, destinations with `faculties`.
  const listingIndex = new Map(listings.map((l, i) => [l.listing_id, i]));
  const facultyIndex = new Map(faculties.map((f, i) => [f.faculty_id, i]));

  // 5. Build UPSERT payload only for the pairs we actually need to fill,
  //    looking up each pair's distance by index. Skip pairs OSRM couldn't
  //    route (null distance) — we'll try again on the next cron tick.
  const rows = [];
  let unroutable = 0;
  for (const { listing, faculty } of missing) {
    const li = listingIndex.get(listing.listing_id);
    const fi = facultyIndex.get(faculty.faculty_id);
    const distanceM = table.distances?.[li]?.[fi];
    if (distanceM == null) {
      unroutable++;
      continue;
    }
    const { walk, transit } = distanceToMinutes(Number(distanceM));
    rows.push({
      listing_id: listing.listing_id,
      faculty_id: faculty.faculty_id,
      walk_minutes: walk,
      transit_minutes: transit,
    });
  }

  if (rows.length === 0) {
    if (unroutable > 0) {
      console.error(
        `[recomputeMissingDistances] ${unroutable} pair(s) unroutable, 0 inserted`,
      );
    }
    return {
      ok: true,
      computed: 0,
      missingBefore: missing.length,
      listings: listings.length,
      faculties: faculties.length,
      unroutable,
    };
  }

  // 6. UPSERT with ignoreDuplicates so a pair that snuck in between our fetch
  //    and our write (e.g. a concurrent manual script run) is silently kept —
  //    we only ever fill in the gaps. PK is (listing_id, faculty_id) per
  //    migration 001.
  const { error: upsertErr } = await supabase
    .from('faculty_distances')
    .upsert(rows, {
      onConflict: 'listing_id,faculty_id',
      ignoreDuplicates: true,
    });

  if (upsertErr) {
    console.error('[recomputeMissingDistances] upsert failed:', upsertErr);
    return { ok: false, reason: `upsert: ${upsertErr.message || upsertErr}` };
  }

  return {
    ok: true,
    computed: rows.length,
    missingBefore: missing.length,
    listings: listings.length,
    faculties: faculties.length,
    unroutable,
  };
}
