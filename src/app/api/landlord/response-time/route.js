import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken, getSupabaseWithToken, getSupabaseAsService } from '@/lib/supabaseServer';
import { getLandlordResponseTime } from '@/lib/landlordResponseTime';

// Service-role: migration 065 drops auth_user_id from the anon column
// allowlist on landlords, so this self-lookup can't run on the anon client.
// userId is JWT-derived, so the read stays scoped to the authenticated caller.
async function getLandlordId(userId) {
  const { data } = await getSupabaseAsService()
    .from('landlords')
    .select('landlord_id')
    .eq('auth_user_id', userId)
    .single();
  return data?.landlord_id ?? null;
}

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const authedSupabase = getSupabaseWithToken(token);

  // Landlord's listing IDs (RLS-scoped to this landlord).
  const { data: listings } = await authedSupabase
    .from('listings')
    .select('listing_id')
    .eq('landlord_id', landlordId);

  const listingIds = (listings || []).map((l) => l.listing_id);

  try {
    const stats = await getLandlordResponseTime(authedSupabase, listingIds);
    return NextResponse.json({ responseTime: stats });
  } catch (err) {
    console.error('Failed to compute landlord response time:', err);
    return NextResponse.json({ error: 'Failed to compute response time' }, { status: 500 });
  }
}
