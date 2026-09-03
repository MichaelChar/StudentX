import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  getSupabaseAsService,
} from '@/lib/supabaseServer';
import { getHostNavSummary } from '@/lib/hostNavSummary';

/*
  The host nav's three numbers — parity Feature 49 addendum.

  The nav renders on EVERY landlord page, so this exists to make that one
  round-trip instead of three (analytics + bookings + inquiries). It returns
  presence booleans, never counts: see the note in lib/hostNavSummary.js.

  Deliberately NOT cached at the edge. It is per-landlord and changes the
  moment a student sends anything; a stale dot is the failure mode the whole
  feature is built to avoid. It is also an auth-touching route, so OpenNext on
  Workers would force it private regardless (see CLAUDE.md).
*/

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
  /*
    404, not 500. A signed-in STUDENT hitting this has no landlord row, and
    that is an ordinary outcome, not a fault — the shell treats it as "no nav
    numbers" and carries on.
  */
  if (!landlordId) {
    return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });
  }

  const authedSupabase = getSupabaseWithToken(token);

  const { data: listings } = await authedSupabase
    .from('listings')
    .select('listing_id')
    .eq('landlord_id', landlordId);

  const listingIds = (listings || []).map((l) => l.listing_id).filter(Boolean);

  // getHostNavSummary swallows its own query errors — chrome must not 500.
  const summary = await getHostNavSummary(authedSupabase, listingIds);

  return NextResponse.json({ summary });
}
