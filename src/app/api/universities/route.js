import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { DEFAULT_CITY, isSupportedCity } from '@/lib/cityRoutes';

/**
 * City-scoped university list — powers the dropdown in the landlord listing
 * form (migration 066). Public reference data, cached like /api/amenities.
 *
 * `?city=` defaults to DEFAULT_CITY; an unsupported slug 400s rather than
 * silently returning an empty list, so a typo shows up as a broken dropdown
 * with an error rather than a dropdown that looks legitimately empty.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || DEFAULT_CITY;

    if (!isSupportedCity(city)) {
      return NextResponse.json({ error: 'Unsupported city' }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from('universities')
      .select('university_id, name, short_name')
      .eq('city_slug', city)
      .order('sort_order');

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json({ error: 'Failed to fetch universities' }, { status: 500 });
    }

    const response = NextResponse.json({ universities: data });
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return response;
  } catch (err) {
    console.error('Unexpected error in GET /api/universities:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
