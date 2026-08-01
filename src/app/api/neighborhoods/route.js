import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

/**
 * Controlled neighborhood list for the landlord form select and results facet.
 * Prefers the `neighborhoods` reference table (migration 100); falls back to
 * DISTINCT location.neighborhood when the table is missing (pre-100 stacks).
 */
export async function GET() {
  try {
    const supabase = getSupabase();

    const primary = await supabase
      .from('neighborhoods')
      .select('name')
      .order('name');

    if (!primary.error && Array.isArray(primary.data) && primary.data.length > 0) {
      const names = primary.data.map((r) => r.name).filter(Boolean);
      const response = NextResponse.json({ neighborhoods: names });
      response.headers.set(
        'Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=7200',
      );
      return response;
    }

    // Fallback: distinct free-text values from location (legacy).
    const { data, error } = await supabase
      .from('location')
      .select('neighborhood')
      .order('neighborhood');

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch neighborhoods' },
        { status: 500 },
      );
    }

    const unique = [
      ...new Set((data || []).map((r) => r.neighborhood).filter(Boolean)),
    ].sort();

    const response = NextResponse.json({ neighborhoods: unique });
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=7200',
    );
    return response;
  } catch (err) {
    console.error('Unexpected error in GET /api/neighborhoods:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
