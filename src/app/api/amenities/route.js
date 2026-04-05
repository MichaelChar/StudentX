import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from('amenities')
      .select('amenity_id, name')
      .order('name');

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json({ error: 'Failed to fetch amenities' }, { status: 500 });
    }

    const response = NextResponse.json({ amenities: data });
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return response;
  } catch (err) {
    console.error('Unexpected error in GET /api/amenities:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
