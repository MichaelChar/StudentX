import { describe, it, expect, vi } from 'vitest';
import { coordsChanged, remeasureUniversityDistances, refreshDistancesFromPin } from '@/lib/listingPinMove';

describe('coordsChanged', () => {
  const stored = { lat: '40.629410547318486', lng: '22.966596' }; // numeric comes back as text

  it('is false when the write carries no coordinates', () => {
    expect(coordsChanged(stored, {})).toBe(false);
  });

  it('is false for a resave of the same pin, across numeric/text round-trips', () => {
    expect(coordsChanged(stored, { lat: 40.629410547318486, lng: 22.966596 })).toBe(false);
  });

  it('is true when the pin moves', () => {
    expect(coordsChanged(stored, { lat: 40.63, lng: 22.966596 })).toBe(true);
    expect(coordsChanged(stored, { lat: 40.629410547318486, lng: 22.95 })).toBe(true);
  });

  it('is true for a first pin on a listing that had none', () => {
    expect(coordsChanged(null, { lat: 40.63, lng: 22.95 })).toBe(true);
    expect(coordsChanged({ lat: null, lng: null }, { lat: 40.63, lng: 22.95 })).toBe(true);
  });
});

describe('remeasureUniversityDistances', () => {
  function stubSupabase({ faculties = [], universities = [], facultiesError = null } = {}) {
    const writes = { deleted: null, inserted: null };
    const supabase = {
      from(table) {
        if (table === 'faculties') {
          return { select: async () => ({ data: faculties, error: facultiesError }) };
        }
        if (table === 'universities') {
          return { select: async () => ({ data: universities, error: null }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
      // writeUniversityDistances replaces the rows in one atomic RPC (127).
      rpc: async (name, args) => {
        if (name !== 'replace_listing_university_distances') throw new Error(`unexpected rpc ${name}`);
        writes.deleted = args.p_listing_id;
        writes.inserted = args.p_rows;
        return { error: null };
      },
    };
    return { supabase, writes };
  }

  it('measures from the NEW pin and replaces the stored rows', async () => {
    const { supabase, writes } = stubSupabase({
      faculties: [{ faculty_id: 'auth-law', university: 'AUTH', lat: 40.63, lng: 22.95 }],
    });
    const computeImpl = vi.fn(async () => [
      { university_id: 'auth', distance_meters: 700, source: 'computed' },
      { university_id: 'uom', distance_meters: 1000, source: 'computed' },
    ]);

    const result = await remeasureUniversityDistances({
      supabase, listingId: '0106003', lat: 40.64, lng: 22.94, computeImpl,
    });

    expect(result).toEqual({ ok: true, written: 2 });
    expect(computeImpl.mock.calls[0][0]).toEqual({ lat: 40.64, lng: 22.94 });
    expect(writes.deleted).toBe('0106003');
    expect(writes.inserted.map((r) => [r.university_id, r.distance_meters, r.source])).toEqual([
      ['auth', 700, 'computed'],
      ['uom', 1000, 'computed'],
    ]);
  });

  it('keeps the existing rows when too few universities come back', async () => {
    // Replacing them would leave a live listing below MIN_UNIVERSITY_DISTANCES.
    const { supabase, writes } = stubSupabase();
    const result = await remeasureUniversityDistances({
      supabase, listingId: '0106003', lat: 40.64, lng: 22.94,
      computeImpl: async () => [{ university_id: 'auth', distance_meters: 700, source: 'computed' }],
    });
    expect(result.ok).toBe(false);
    expect(writes.deleted).toBeNull();
    expect(writes.inserted).toBeNull();
  });

  it('does not write when the faculties read fails', async () => {
    const { supabase, writes } = stubSupabase({ facultiesError: { message: 'boom' } });
    const computeImpl = vi.fn();
    const result = await remeasureUniversityDistances({
      supabase, listingId: '0106003', lat: 40.64, lng: 22.94, computeImpl,
    });
    expect(result).toEqual({ ok: false, reason: 'faculties: boom' });
    expect(computeImpl).not.toHaveBeenCalled();
    expect(writes.deleted).toBeNull();
  });
});

describe('refreshDistancesFromPin', () => {
  const FACULTIES = [
    { faculty_id: 'auth-law', university: 'AUTH', lat: '40.63112', lng: '22.95678' },
    { faculty_id: 'auth-library', university: 'AUTH', lat: '40.62961', lng: '22.95795' },
  ];
  function stub() {
    const writes = { universities: null, faculties: null, upsertOpts: null };
    const supabase = {
      from(table) {
        if (table === 'faculties') return { select: async () => ({ data: FACULTIES, error: null }) };
        if (table === 'universities') return { select: async () => ({ data: [], error: null }) };
        if (table === 'faculty_distances') {
          return {
            upsert: async (rows, opts) => {
              writes.faculties = rows;
              writes.upsertOpts = opts;
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: async (_name, args) => {
        writes.universities = args.p_rows;
        return { error: null };
      },
    };
    return { supabase, writes };
  }

  it('writes both tables from ONE measurement, stamped with the new pin', async () => {
    const { supabase, writes } = stub();
    const measureImpl = vi.fn(async () => ({
      universities: [
        { university_id: 'auth', distance_meters: 899, source: 'computed' },
        { university_id: 'uom', distance_meters: 1012, source: 'computed' },
      ],
      // auth-library unreachable: absent, left for the cron.
      facultyMetres: new Map([['auth-law', 1201]]),
    }));

    const result = await refreshDistancesFromPin({
      supabase, listingId: '0106003', lat: 40.6294, lng: 22.9666, measureImpl,
    });

    expect(measureImpl).toHaveBeenCalledTimes(1);
    expect(measureImpl.mock.calls[0][2]).toMatchObject({ caller: 'pin-move' });
    expect(result.ok).toBe(true);
    expect(writes.universities.map((r) => [r.university_id, r.measured_from_lat])).toEqual([
      ['auth', 40.6294], ['uom', 40.6294],
    ]);
    // Same pace model as recomputeDistances: 1201 m -> 15 min walk, 10 min bus.
    expect(writes.faculties).toEqual([{
      listing_id: '0106003',
      faculty_id: 'auth-law',
      walk_minutes: 15,
      transit_minutes: 10,
      measured_from_lat: 40.6294,
      measured_from_lng: 22.9666,
      measured_to_lat: 40.63112,
      measured_to_lng: 22.95678,
    }]);
    expect(writes.upsertOpts.ignoreDuplicates).not.toBe(true);
  });

  it('keeps university rows below the minimum but still writes the walk times', async () => {
    const { supabase, writes } = stub();
    const result = await refreshDistancesFromPin({
      supabase, listingId: '0106003', lat: 40.6294, lng: 22.9666,
      measureImpl: async () => ({
        universities: [{ university_id: 'auth', distance_meters: 899, source: 'computed' }],
        facultyMetres: new Map([['auth-law', 1201]]),
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.universities.ok).toBe(false);
    expect(writes.universities).toBeNull();
    expect(writes.faculties).toHaveLength(1);
  });
});
