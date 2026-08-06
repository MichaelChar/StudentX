import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import {
  canAdminGoLive,
  flagsForAdminGoLive,
  flagsForAdminRevoke,
  isListingSubmitted,
} from '@/lib/listingGoLive';
import { isPropertyVerified } from '@/lib/propertyVerification';

/**
 * GET /api/admin/listing-go-live?filter=candidates|live|all
 *
 * Admin queue for manually taking listings public after draft submit +
 * landlord ID + video-call property verification.
 */
export async function GET(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') || 'candidates';
  if (!['candidates', 'live', 'all'].includes(filter)) {
    return NextResponse.json(
      { error: 'filter must be candidates, live, or all' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAsService();

  let query = supabase
    .from('listings')
    .select(`
      listing_id,
      title,
      listing_status,
      flags,
      created_at,
      updated_at,
      landlords (
        landlord_id,
        name,
        email,
        phone,
        is_verified
      ),
      location (
        address,
        neighborhood
      ),
      rent (
        monthly_price
      ),
      property_verifications (
        verification_id,
        method,
        status,
        verified_at
      )
    `)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (filter === 'live') {
    query = query.eq('listing_status', 'active');
  } else if (filter === 'candidates') {
    // Not public — submitted / pending review (exclude pure never-touched if possible via flags)
    query = query.neq('listing_status', 'active');
  }

  const { data, error } = await query;

  if (error) {
    console.error('listing-go-live list failed:', error);
    return NextResponse.json({ error: 'Failed to load listings' }, { status: 500 });
  }

  const listings = (data || [])
    .map((row) => {
      const landlord = Array.isArray(row.landlords) ? row.landlords[0] : row.landlords;
      const location = Array.isArray(row.location) ? row.location[0] : row.location;
      const rent = Array.isArray(row.rent) ? row.rent[0] : row.rent;
      const pv = Array.isArray(row.property_verifications)
        ? row.property_verifications
        : [];
      const isVerified = landlord?.is_verified === true;
      const videoOk = isPropertyVerified(pv);
      const listing = {
        listing_id: row.listing_id,
        flags: row.flags,
        listing_status: row.listing_status,
      };
      const gateResult = canAdminGoLive({
        isVerified,
        propertyVerifications: pv,
        listing,
      });

      return {
        listing_id: row.listing_id,
        title: row.title,
        listing_status: row.listing_status,
        flags: row.flags || {},
        created_at: row.created_at,
        updated_at: row.updated_at,
        address: location?.address ?? null,
        neighborhood: location?.neighborhood ?? null,
        monthly_price: rent?.monthly_price ?? null,
        landlord_id: landlord?.landlord_id ?? null,
        landlord_name: landlord?.name ?? null,
        landlord_email: landlord?.email ?? null,
        landlord_phone: landlord?.phone ?? null,
        id_verified: isVerified,
        video_verified: videoOk,
        submitted: isListingSubmitted(listing),
        can_go_live: gateResult.ok,
        missing: gateResult.ok ? [] : gateResult.missing,
      };
    })
    .filter((row) => {
      if (filter === 'candidates') {
        // Prefer rows that have at least been submitted or admin-touched.
        return (
          row.submitted ||
          row.flags?.listing_status === 'submitted' ||
          row.flags?.listing_status === 'live' ||
          row.flags?.admin_live_approved === true
        );
      }
      return true;
    });

  return NextResponse.json({ listings });
}

/**
 * POST /api/admin/listing-go-live
 * Body: { listing_id, action: 'approve' | 'revoke' }
 */
export async function POST(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { listing_id: listingId, action } = body || {};
  if (!listingId || typeof listingId !== 'string') {
    return NextResponse.json({ error: 'listing_id is required' }, { status: 400 });
  }
  if (!['approve', 'revoke'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be "approve" or "revoke"' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAsService();

  const { data: row, error: fetchError } = await supabase
    .from('listings')
    .select(`
      listing_id,
      listing_status,
      flags,
      landlords (
        landlord_id,
        is_verified,
        email
      ),
      property_verifications (
        verification_id,
        method,
        status,
        verified_at
      )
    `)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const landlord = Array.isArray(row.landlords) ? row.landlords[0] : row.landlords;
  const pv = Array.isArray(row.property_verifications) ? row.property_verifications : [];
  const prevFlags = row.flags && typeof row.flags === 'object' ? row.flags : {};

  if (action === 'approve') {
    const check = canAdminGoLive({
      isVerified: landlord?.is_verified === true,
      propertyVerifications: pv,
      listing: { flags: prevFlags, listing_status: row.listing_status },
    });
    if (!check.ok) {
      return NextResponse.json(
        {
          error: 'Listing does not meet go-live requirements',
          missing: check.missing,
        },
        { status: 400 },
      );
    }

    const next = flagsForAdminGoLive(prevFlags, gate.user?.email);
    const { error: updateError } = await supabase
      .from('listings')
      .update({
        listing_status: next.listing_status,
        flags: next.flags,
      })
      .eq('listing_id', listingId);

    if (updateError) {
      console.error('listing-go-live approve failed:', updateError);
      return NextResponse.json({ error: 'Failed to go live' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      listing_id: listingId,
      listing_status: next.listing_status,
      flags: next.flags,
    });
  }

  // revoke
  const next = flagsForAdminRevoke(prevFlags);
  const { error: revokeError } = await supabase
    .from('listings')
    .update({
      listing_status: next.listing_status,
      flags: next.flags,
    })
    .eq('listing_id', listingId);

  if (revokeError) {
    console.error('listing-go-live revoke failed:', revokeError);
    return NextResponse.json({ error: 'Failed to take offline' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    listing_id: listingId,
    listing_status: next.listing_status,
    flags: next.flags,
  });
}
