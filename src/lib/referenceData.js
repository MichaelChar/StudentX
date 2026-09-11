import { getSupabase } from '@/lib/supabase';

/*
  Reference lookups for the results page, lifted out of their routes for the
  same reason `searchListings` was (issue #443): they now have TWO callers.

  The routes still own the HTTP contract — status codes, cache headers — and
  the results server component calls these directly so the values are in the
  first HTML response instead of arriving over the network after hydration.

  WHY THAT MATTERED. Measured on prod, the results page hydrated at 636ms and
  only THEN began fetching: /api/faculties and /api/neighborhoods at 805ms,
  and /api/listings/price-distribution queued behind them, not starting until
  1549ms and finishing at ~2.5s. In the browser those requests took 1487ms and
  964ms versus 170-360ms when curled directly — the gap is the waterfall, not
  the queries. The combined payload is about 150 bytes: nine neighbourhood
  strings, thirteen faculties, and a handful of prices. Two and a half seconds
  of dead filter UI to deliver it.

  Returning `{ status, body }` rather than a Response keeps these usable from
  a server component, where building a NextResponse only to read its JSON back
  would be silly. Each route re-wraps in one line.
*/

/** Faculties for the commute chip. Static reference data — 13 rows. */
export async function fetchFaculties() {
  try {
    const { data, error } = await getSupabase()
      .from('faculties')
      .select('faculty_id, name, university')
      .order('university')
      .order('name');

    if (error) {
      console.error('Supabase query error:', error);
      return { status: 500, body: { error: 'Failed to fetch faculties' } };
    }

    return {
      status: 200,
      body: {
        faculties: data.map((row) => ({
          id: row.faculty_id,
          name: row.name,
          university: row.university,
        })),
      },
    };
  } catch (err) {
    console.error('Unexpected error in fetchFaculties:', err);
    return { status: 500, body: { error: 'Internal server error' } };
  }
}

/**
 * Controlled neighborhood list for the landlord form select and results facet.
 * Prefers the `neighborhoods` reference table (migration 100); falls back to
 * DISTINCT location.neighborhood when the table is missing (pre-100 stacks).
 */
export async function fetchNeighborhoods() {
  try {
    const supabase = getSupabase();

    const primary = await supabase.from('neighborhoods').select('name').order('name');

    if (!primary.error && Array.isArray(primary.data) && primary.data.length > 0) {
      return {
        status: 200,
        body: { neighborhoods: primary.data.map((r) => r.name).filter(Boolean) },
      };
    }

    // Fallback: distinct free-text values from location (legacy).
    const { data, error } = await supabase
      .from('location')
      .select('neighborhood')
      .order('neighborhood');

    if (error) {
      console.error('Supabase query error:', error);
      return { status: 500, body: { error: 'Failed to fetch neighborhoods' } };
    }

    const unique = [
      ...new Set((data || []).map((r) => r.neighborhood).filter(Boolean)),
    ].sort();

    return { status: 200, body: { neighborhoods: unique } };
  } catch (err) {
    console.error('Unexpected error in fetchNeighborhoods:', err);
    return { status: 500, body: { error: 'Internal server error' } };
  }
}
