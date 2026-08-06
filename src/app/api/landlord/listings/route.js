import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  getSupabaseAsService,
} from '@/lib/supabaseServer';
import { recomputeMissingDistances } from '@/lib/recomputeDistances';
import { writeUniversityDistances } from '@/lib/universityDistances';
import { selectLandlordListings } from '@/lib/landlordListingSelect';
import { parseListingWriteBody } from '@/lib/landlordListingBody';

// Service-role: migration 065 drops auth_user_id from the anon column
// allowlist on landlords, so this self-lookup can't run on the anon client.
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
  if (!landlordId) {
    return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });
  }

  const authedSupabase = getSupabaseWithToken(token);
  const { data, error } = await selectLandlordListings(authedSupabase, landlordId);

  if (error) {
    console.error('Failed to fetch landlord listings:', error);
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });
  }

  return NextResponse.json({ listings: data });
}

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) {
    return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });
  }

  const body = await request.json();
  const isDraft = body.draft === true;
  const isSubmit = body.submit === true;

  const parsed = await parseListingWriteBody(body, {
    partial: isDraft && !isSubmit,
    requireUniversities: isSubmit,
    requireCoords: true,
    requirePhotos: isSubmit,
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const d = parsed.data;

  // Draft creates still need a property_type (NOT NULL FK). Callers should
  // send one; if missing on a pure draft, reject clearly.
  if (!d.property_type) {
    return NextResponse.json(
      { error: 'property_type is required' },
      { status: 400 },
    );
  }
  if (!d.normalizedAddress || !d.normalizedNeighborhood) {
    return NextResponse.json(
      { error: 'address and neighborhood are required' },
      { status: 400 },
    );
  }
  if (!d.normalizedTitle) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (d.lat == null || d.lng == null) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const authedSupabase = getSupabaseWithToken(token);
  const supabase = getSupabaseAsService();

  const { data: rentData, error: rentError } = await supabase
    .from('rent')
    .insert({
      monthly_price: d.monthly_price ?? null,
      currency: 'EUR',
      bills_included: d.bills_included ?? false,
      deposit: d.deposit ?? 0,
    })
    .select('rent_id')
    .single();

  if (rentError) {
    console.error('Failed to insert rent:', rentError);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }

  const { data: locationData, error: locationError } = await supabase
    .from('location')
    .insert({
      address: d.normalizedAddress,
      neighborhood: d.normalizedNeighborhood,
      lat: d.lat,
      lng: d.lng,
    })
    .select('location_id')
    .single();

  if (locationError) {
    console.error('Failed to insert location:', locationError);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }

  const { data: propType, error: propTypeError } = await getSupabase()
    .from('property_types')
    .select('property_type_id')
    .eq('name', d.property_type)
    .single();

  if (propTypeError || !propType) {
    return NextResponse.json({ error: 'Invalid property type' }, { status: 400 });
  }

  const { data: maxRow } = await getSupabase()
    .from('listings')
    .select('listing_id')
    .eq('landlord_id', landlordId)
    .order('listing_id', { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (maxRow && maxRow.length > 0) {
    nextSeq = parseInt(maxRow[0].listing_id.slice(4), 10) + 1;
  }
  if (nextSeq > 999) {
    return NextResponse.json({ error: 'Maximum of 999 listings reached' }, { status: 400 });
  }
  const listingId = landlordId + String(nextSeq).padStart(3, '0');

  const listingInsert = {
    listing_id: listingId,
    landlord_id: landlordId,
    title: d.normalizedTitle,
    rent_id: rentData.rent_id,
    location_id: locationData.location_id,
    property_type_id: propType.property_type_id,
    description: d.normalizedDescription ?? null,
    photos: d.photos || [],
    external_photo_urls: d.external_photo_urls || [],
    sqm: d.sqm ?? null,
    floor: d.floor ?? null,
    available_from: d.available_from ?? null,
    available_to: d.available_to ?? null,
    min_duration_months: d.minDuration ?? null,
    max_duration_months: d.maxDuration ?? null,
    bedrooms: d.bedrooms ?? null,
    bathrooms: d.bathrooms ?? null,
    agency_fee: d.agency_fee ?? null,
    video_url: d.video_url ?? null,
    smoking_allowed: d.smoking_allowed ?? null,
    pets_allowed: d.pets_allowed ?? null,
    additional_rules: d.additional_rules ?? null,
    // Never public on create — admin go-live is the only path to active.
    listing_status: d.listing_status || 'disabled',
    flags: d.flags || {
      listing_status: isSubmit ? 'submitted' : 'draft',
    },
  };

  const { data: listing, error: listingError } = await authedSupabase
    .from('listings')
    .insert(listingInsert)
    .select('listing_id')
    .single();

  if (listingError) {
    // Retry without marketplace columns if prod is pre-100.
    console.warn('Listing insert failed, retrying lean insert:', listingError.message);
    const lean = {
      listing_id: listingId,
      landlord_id: landlordId,
      title: d.normalizedTitle,
      rent_id: rentData.rent_id,
      location_id: locationData.location_id,
      property_type_id: propType.property_type_id,
      description: d.normalizedDescription ?? null,
      photos: d.photos || [],
      sqm: d.sqm ?? null,
      floor: d.floor ?? null,
      available_from: d.available_from ?? null,
      min_duration_months: d.minDuration ?? null,
    };
    const retry = await authedSupabase
      .from('listings')
      .insert(lean)
      .select('listing_id')
      .single();
    if (retry.error) {
      console.error('Failed to insert listing:', retry.error);
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
    }
    void listing;
  }

  if (d.amenity_ids?.length > 0) {
    const rows = d.amenity_ids.map((amenity_id) => ({
      listing_id: listingId,
      amenity_id,
    }));
    const { error: amenityError } = await authedSupabase
      .from('listing_amenities')
      .insert(rows);
    if (amenityError) {
      console.error('Failed to insert amenities:', amenityError);
    }
  }

  if (d.universityDistanceRows?.length > 0) {
    const { error: distanceError } = await writeUniversityDistances(
      authedSupabase,
      listingId,
      d.universityDistanceRows,
    );
    if (distanceError) {
      console.error('Failed to insert university distances:', distanceError);
    }
  }

  if (d.blackouts?.length > 0) {
    const { error: blockError } = await authedSupabase
      .from('listing_availability_blocks')
      .insert(d.blackouts.map((b) => ({ ...b, listing_id: listingId })));
    if (blockError) {
      console.error('Failed to insert blackouts:', blockError);
    }
  }

  try {
    await recomputeMissingDistances({
      listingIds: [listingId],
      supabase: getSupabaseAsService(),
    });
  } catch (err) {
    console.error('[landlord/listings POST] inline distance recompute failed:', err);
  }

  return NextResponse.json({ listing_id: listingId }, { status: 201 });
}
