import { describe, it, expect, vi, afterEach } from 'vitest';
import { recomputeMissingDistances } from '@/lib/recomputeDistances';
import { healStaleUniversityDistances } from '@/lib/listingPinMove';
import { sharedMeasuredFrom, writeUniversityDistances } from '@/lib/universityDistances';

/*
  Migration 126: distance rows record the endpoints they were measured between,
  so a stale row can be told apart from a fresh one and healed by the cron,
  whatever made it stale (a moved pin, a moved faculty, a pre-126 row).
*/

const PIN = { lat: 40.6294, lng: 22.9666 };
const OLD_PIN = { lat: 40.6378, lng: 22.9528 };
const LAW = { faculty_id: 'auth-law', lat: 40.63112, lng: 22.95678 };
const LIB = { faculty_id: 'auth-library', lat: 40.62961, lng: 22.95795 };
const MED = { faculty_id: 'auth-medical', lat: 40.63117, lng: 22.96056 };
const SCI = { faculty_id: 'auth-sciences', lat: 40.63369, lng: 22.95672 };

function stamped(faculty, from = PIN, to = faculty) {
  return {
    listing_id: '0106003',
    faculty_id: faculty.faculty_id,
    measured_from_lat: String(from.lat), // numeric comes back as text
    measured_from_lng: String(from.lng),
    measured_to_lat: String(to.lat),
    measured_to_lng: String(to.lng),
  };
}

function recomputeClient(existing) {
  const upserts = [];
  let served = false;
  const data = {
    listings: [{ listing_id: '0106003', location: PIN }],
    faculties: [LAW, LIB, MED, SCI],
  };
  const client = {
    from(table) {
      const b = {
        select: () => b,
        in: () => b,
        range: () => b,
        upsert: async (rows, opts) => {
          upserts.push({ rows, opts });
          return { error: null };
        },
        then: (resolve) => {
          if (table === 'faculty_distances') {
            const page = served ? [] : existing;
            served = true;
            return resolve({ data: page, error: null });
          }
          return resolve({ data: data[table], error: null });
        },
      };
      return b;
    },
  };
  return { client, upserts };
}

afterEach(() => vi.unstubAllGlobals());

describe('recomputeMissingDistances: stale rows (migration 126)', () => {
  it('re-measures absent, unstamped, moved-pin and moved-faculty pairs, and leaves a fresh one', async () => {
    const { client, upserts } = recomputeClient([
      stamped(LAW), // fresh
      stamped(LIB, OLD_PIN), // the listing pin moved
      { ...stamped(MED, PIN, { lat: 40.6225, lng: 22.9555 }) }, // the faculty moved (as 124 did)
      { listing_id: '0106003', faculty_id: 'auth-sciences' }, // pre-126, unstamped
    ]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 'Ok', distances: [[1000, 900, 1700, 1500]] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await recomputeMissingDistances({ supabase: client });

    expect(result).toMatchObject({ ok: true, computed: 3, missingBefore: 3, stale: 3 });
    const written = upserts[0].rows;
    expect(written.map((r) => r.faculty_id).sort()).toEqual(['auth-library', 'auth-medical', 'auth-sciences']);
    // Every written row is stamped with the CURRENT endpoints.
    const lib = written.find((r) => r.faculty_id === 'auth-library');
    expect(lib).toMatchObject({
      measured_from_lat: PIN.lat,
      measured_from_lng: PIN.lng,
      measured_to_lat: LIB.lat,
      measured_to_lng: LIB.lng,
    });
    // Stale rows must be REPLACED, so the upsert can't skip existing keys.
    expect(upserts[0].opts.ignoreDuplicates).not.toBe(true);
  });

  it('is a no-op, with no router call, when every row is fresh', async () => {
    const { client, upserts } = recomputeClient([stamped(LAW), stamped(LIB), stamped(MED), stamped(SCI)]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await recomputeMissingDistances({ supabase: client });

    expect(result).toMatchObject({ ok: true, computed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });
});

describe('healStaleUniversityDistances', () => {
  function rowsAt(from, source = 'computed') {
    return [
      { source, measured_from_lat: from ? String(from.lat) : null, measured_from_lng: from ? String(from.lng) : null },
      { source: 'computed', measured_from_lat: from ? String(from.lat) : null, measured_from_lng: from ? String(from.lng) : null },
    ];
  }
  function client(listings) {
    return {
      from: () => ({ select: async () => ({ data: listings, error: null }) }),
    };
  }

  const LISTINGS = [
    { listing_id: 'fresh', location: PIN, listing_university_distances: rowsAt(PIN) },
    { listing_id: 'moved', location: PIN, listing_university_distances: rowsAt(OLD_PIN) },
    { listing_id: 'unstamped', location: PIN, listing_university_distances: rowsAt(null) },
    { listing_id: 'typed', location: PIN, listing_university_distances: rowsAt(OLD_PIN, 'landlord') },
    { listing_id: 'no-rows', location: PIN, listing_university_distances: [] },
  ];

  it('re-measures stale computed listings from their current pin, and skips the rest', async () => {
    const remeasureImpl = vi.fn(async () => ({ ok: true, written: 3 }));

    const result = await healStaleUniversityDistances({
      supabase: client(LISTINGS), spacingMs: 0, remeasureImpl,
    });

    expect(remeasureImpl.mock.calls.map(([a]) => a.listingId)).toEqual(['moved', 'unstamped']);
    expect(remeasureImpl.mock.calls[0][0]).toMatchObject({ lat: PIN.lat, lng: PIN.lng });
    expect(result).toEqual({
      ok: true, stale: 2, healed: 2, failed: [], remaining: 0, skippedLandlordRows: 1,
    });
  });

  it('caps the batch and reports what is left for the next run', async () => {
    const remeasureImpl = vi.fn(async () => ({ ok: true, written: 3 }));
    const result = await healStaleUniversityDistances({
      supabase: client(LISTINGS), limit: 1, spacingMs: 0, remeasureImpl,
    });
    expect(remeasureImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ stale: 2, healed: 1, remaining: 1 });
  });

  it('reports a failed re-measure instead of hiding it', async () => {
    const result = await healStaleUniversityDistances({
      supabase: client(LISTINGS),
      spacingMs: 0,
      remeasureImpl: async ({ listingId }) =>
        listingId === 'moved' ? { ok: false, reason: 'only 1 universities measured' } : { ok: true },
    });
    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(['moved: only 1 universities measured']);
    expect(result.healed).toBe(1);
  });
});

describe('sharedMeasuredFrom', () => {
  it('returns the common stamp', () => {
    expect(sharedMeasuredFrom([
      { measured_from_lat: '40.6294', measured_from_lng: '22.9666' },
      { measured_from_lat: 40.6294, measured_from_lng: 22.9666 },
    ])).toEqual({ lat: 40.6294, lng: 22.9666 });
  });

  it('is null for unstamped, mixed or empty rows', () => {
    expect(sharedMeasuredFrom([{ measured_from_lat: null, measured_from_lng: null }])).toBeNull();
    expect(sharedMeasuredFrom([
      { measured_from_lat: 40.6294, measured_from_lng: 22.9666 },
      { measured_from_lat: 40.6378, measured_from_lng: 22.9528 },
    ])).toBeNull();
    expect(sharedMeasuredFrom([])).toBeNull();
    expect(sharedMeasuredFrom(undefined)).toBeNull();
  });
});

describe('writeUniversityDistances stamps', () => {
  function client() {
    const writes = {};
    return {
      writes,
      from: () => ({
        delete: () => ({ eq: async () => ({ error: null }) }),
        insert: async (rows) => {
          writes.rows = rows;
          return { error: null };
        },
      }),
    };
  }
  const ROWS = [{ university_id: 'auth', distance_meters: 678, source: 'computed' }];

  it('stamps rows with a known origin', async () => {
    const c = client();
    await writeUniversityDistances(c, '0106003', ROWS, PIN);
    expect(c.writes.rows[0]).toMatchObject({ measured_from_lat: PIN.lat, measured_from_lng: PIN.lng });
  });

  it('leaves rows unstamped when the origin is unknown, so the cron re-measures them', async () => {
    const c = client();
    await writeUniversityDistances(c, '0106003', ROWS);
    expect(c.writes.rows[0]).toMatchObject({ measured_from_lat: null, measured_from_lng: null });
  });
});
