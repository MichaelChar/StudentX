import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import {
  isPendingPropertyVerificationRow,
  isRejectedPropertyVerificationRow,
} from '@/lib/propertyVerification';

/**
 * GET /api/admin/property-verifications?status=pending|approved|rejected
 * Admin queue for W4 property video-call verification (separate from
 * landlord ID verification_requests under /api/admin/verifications).
 */
export async function GET(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json(
      { error: 'status must be pending, approved, or rejected' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAsService();

  // Fetch a broad set then filter by derived status — verified_at / outcome
  // live in columns that don't map cleanly to a single eq filter for all
  // three states. Volume is ops-scale (dozens), not marketplace-scale.
  let query = supabase
    .from('property_verifications')
    .select(`
      verification_id,
      listing_id,
      method,
      verified_by,
      verified_at,
      checklist_json,
      notes,
      created_at,
      listings (
        listing_id,
        title,
        photos,
        description,
        landlords (
          landlord_id,
          name,
          phone,
          email
        ),
        location (
          address,
          neighborhood
        ),
        rent (
          monthly_price,
          bills_included,
          deposit
        )
      )
    `)
    .order('created_at', { ascending: true });

  if (status === 'approved') {
    query = query.not('verified_at', 'is', null);
  } else {
    // pending + rejected both have verified_at null
    query = query.is('verified_at', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch property verifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch property verifications' },
      { status: 500 },
    );
  }

  const rows = (data || []).filter((row) => {
    if (status === 'approved') return Boolean(row.verified_at);
    if (status === 'pending') return isPendingPropertyVerificationRow(row);
    if (status === 'rejected') return isRejectedPropertyVerificationRow(row);
    return false;
  });

  const requests = rows.map((row) => {
    const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
    const landlord = Array.isArray(listing?.landlords)
      ? listing.landlords[0]
      : listing?.landlords;
    const location = Array.isArray(listing?.location)
      ? listing.location[0]
      : listing?.location;
    const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;

    return {
      verification_id: row.verification_id,
      listing_id: row.listing_id,
      method: row.method,
      verified_by: row.verified_by,
      verified_at: row.verified_at,
      checklist_json: row.checklist_json || {},
      notes: row.notes,
      created_at: row.created_at,
      status,
      listing_title: listing?.title ?? null,
      listing_photos: Array.isArray(listing?.photos) ? listing.photos : [],
      listing_description: listing?.description ?? null,
      address: location?.address ?? null,
      neighborhood: location?.neighborhood ?? null,
      monthly_price: rent?.monthly_price ?? null,
      bills_included: rent?.bills_included ?? null,
      deposit: rent?.deposit ?? null,
      landlord_id: landlord?.landlord_id ?? null,
      landlord_name: landlord?.name ?? null,
      landlord_phone: landlord?.phone ?? null,
      landlord_email: landlord?.email ?? null,
    };
  });

  return NextResponse.json({ requests });
}
