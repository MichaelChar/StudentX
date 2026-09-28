import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';
import { computeUniversityDistances } from '@/lib/computeUniversityDistances';
import { loadMeasureTargets } from '@/lib/measureTargets';

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

  // Same loader as the server-side re-measures (src/lib/measureTargets.js), so
  // the wizard and the server can't disagree about the same pin.
  const targets = await loadMeasureTargets(
    getSupabaseWithToken(token),
    '[compute-university-distances]',
  );
  if (targets.error) {
    console.error('[compute-university-distances]', targets.error);
    return NextResponse.json({ error: 'Failed to load faculties' }, { status: 500 });
  }

  const distances = await computeUniversityDistances({ lat, lng }, targets.faculties, {
    universities: targets.universities,
  });

  return NextResponse.json({ distances });
}
