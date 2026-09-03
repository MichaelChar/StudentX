import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';
import { computeUniversityDistances } from '@/lib/computeUniversityDistances';

/**
 * Prefill university distances for the listing wizard from a lat/lng pin.
 * Authenticated landlords only. Uses OSRM foot distances (same stack as
 * recompute-distances), falling back to haversine when OSRM is unreachable.
 */
export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  /*
    `faculties` is fully public — RLS "Public can read faculties" (qual true)
    and every column selected here is granted to anon and authenticated alike.
    There is nothing for a service-role key to unlock, and using one here made
    the route 500 in any environment without that secret.
  */
  const supabase = getSupabaseWithToken(token);
  const { data: faculties, error } = await supabase
    .from('faculties')
    .select('faculty_id, university, lat, lng');

  if (error) {
    console.error('[compute-university-distances] faculties:', error);
    return NextResponse.json({ error: 'Failed to load faculties' }, { status: 500 });
  }

  const distances = await computeUniversityDistances(
    { lat, lng },
    faculties || [],
  );

  return NextResponse.json({ distances });
}
