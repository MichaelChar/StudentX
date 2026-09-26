import { describe, it, expect, vi } from 'vitest';
import { coordsChanged, remeasureUniversityDistances } from '@/lib/listingPinMove';

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
        if (table === 'listing_university_distances') {
          return {
            delete: () => ({
              eq: async (_col, id) => {
                writes.deleted = id;
                return { error: null };
              },
            }),
            insert: async (rows) => {
              writes.inserted = rows;
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
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
