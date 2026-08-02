import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseAsService,
} from '@/lib/supabaseServer';
import {
  hasPendingPropertyVerification,
  isPropertyVerified,
} from '@/lib/propertyVerification';

async function getLandlordId(userId) {
  const { data } = await getSupabaseAsService()
    .from('landlords')
    .select('landlord_id')
    .eq('auth_user_id', userId)
    .single();
  return data?.landlord_id ?? null;
}

/**
 * POST /api/landlord/listings/[id]/property-verification
 * Landlord requests a video-call property verification.
 * Creates property_verifications with method=video_call, verified_at=NULL.
 * One pending request per listing — duplicates return 409.
 * Writes are service_role only (RLS has no authenticated INSERT).
 */
export async function POST(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) {
    return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });
  }

  const { id: listingId } = await params;
  if (!listingId || typeof listingId !== 'string') {
    return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 });
  }

  const supabase = getSupabaseAsService();

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('listing_id, landlord_id')
    .eq('listing_id', listingId)
    .maybeSingle();

  if (listingError) {
    console.error('property-verification: listing lookup failed', listingError);
    return NextResponse.json({ error: 'Failed to load listing' }, { status: 500 });
  }
  if (!listing || listing.landlord_id !== landlordId) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('property_verifications')
    .select('verification_id, status, verified_at, checklist_json, created_at')
    .eq('listing_id', listingId);

  if (existingError) {
    console.error('property-verification: existing rows failed', existingError);
    return NextResponse.json({ error: 'Failed to check existing requests' }, { status: 500 });
  }

  if (isPropertyVerified(existing)) {
    return NextResponse.json(
      { error: 'Listing is already property-verified' },
      { status: 409 },
    );
  }

  if (hasPendingPropertyVerification(existing)) {
    return NextResponse.json(
      { error: 'A pending verification request already exists for this listing' },
      { status: 409 },
    );
  }

  const { data: row, error: insertError } = await supabase
    .from('property_verifications')
    .insert({
      listing_id: listingId,
      method: 'video_call',
      status: 'pending',
      verified_at: null,
      verified_by: null,
      checklist_json: {},
      notes: null,
    })
    .select(
      'verification_id, listing_id, method, status, verified_at, checklist_json, notes, created_at',
    )
    .single();

  if (insertError) {
    console.error('property-verification: insert failed', insertError);
    return NextResponse.json({ error: 'Failed to create verification request' }, { status: 500 });
  }

  return NextResponse.json({ verification: row }, { status: 201 });
}
