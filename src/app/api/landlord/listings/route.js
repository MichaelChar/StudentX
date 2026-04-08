import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';
import { canCreateListing } from '@/lib/stripe';

const LANDLORD_LISTING_SELECT = `
  listing_id,
  landlord_id,
  is_featured,
  rent_id,
  location_id,
  property_type_id,
  description,
  photos,
  sqm,
  floor,
  available_from,
  rental_duration,
  created_at,
  updated_at,
  rent ( rent_id, monthly_price, currency, bills_included, deposit ),
  location ( location_id, address, neighborhood, lat, lng ),
  property_types ( property_type_id, name ),
  listing_amenities ( amenities ( amenity_id, name ) )
`;

async function getLandlordId(userId) {
  const { data } = await getSupabase()
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
  const { data, error } = await authedSupabase
    .from('listings')
    .select(LANDLORD_LISTING_SELECT)
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false });

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
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  // Check subscription listing limits
  const limitCheck = await canCreateListing(getSupabase(), landlordId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: limitCheck.reason, upgrade: true, planId: limitCheck.planId },
      { status: 403 }
    );
  }

  const body = await request.json();

  // Validate required fields
  if (!body.address || !body.neighborhood || !body.property_type) {
    return NextResponse.json(
      { error: 'address, neighborhood, and property_type are required' },
      { status: 400 }
    );
  }

  const authedSupabase = getSupabaseWithToken(token);
  const supabase = getSupabase();

  // Insert rent row (use service-role client because the RLS ALL policy on
  // rent requires the rent_id to already appear in listings, which blocks the
  // read-back on a freshly inserted row before the listing is created)
  const { data: rentData, error: rentError } = await supabase
    .from('rent')
    .insert({
      monthly_price: body.monthly_price || null,
      currency: 'EUR',
      bills_included: body.bills_included || false,
      deposit: body.deposit || 0,
    })
    .select('rent_id')
    .single();

  if (rentError) {
    console.error('Failed to insert rent:', rentError);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }

  // Insert location row (same RLS issue as rent — use service-role client)
  const { data: locationData, error: locationError } = await supabase
    .from('location')
    .insert({
      address: body.address,
      neighborhood: body.neighborhood,
      lat: body.lat != null && body.lat !== '' ? parseFloat(body.lat) : null,
      lng: body.lng != null && body.lng !== '' ? parseFloat(body.lng) : null,
    })
    .select('location_id')
    .single();

  if (locationError) {
    console.error('Failed to insert location:', locationError);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }

  // Look up property_type_id
  const { data: propType, error: propTypeError } = await getSupabase()
    .from('property_types')
    .select('property_type_id')
    .eq('name', body.property_type)
    .single();

  if (propTypeError || !propType) {
    return NextResponse.json({ error: 'Invalid property type' }, { status: 400 });
  }

  // Generate listing_id: landlordId (4 digits) + sequence (3 digits)
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

  // Insert listing row
  const { data: listing, error: listingError } = await authedSupabase
    .from('listings')
    .insert({
      listing_id: listingId,
      landlord_id: landlordId,
      rent_id: rentData.rent_id,
      location_id: locationData.location_id,
      property_type_id: propType.property_type_id,
      description: body.description || null,
      photos: body.photos || [],
      sqm: body.sqm || null,
      floor: body.floor != null && body.floor !== '' ? parseInt(body.floor, 10) : null,
      available_from: body.available_from || null,
      rental_duration: body.rental_duration || null,
    })
    .select('listing_id')
    .single();

  if (listingError) {
    console.error('Failed to insert listing:', listingError);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }

  // Insert amenities
  if (body.amenity_ids?.length > 0) {
    const rows = body.amenity_ids.map((amenity_id) => ({ listing_id: listingId, amenity_id }));
    const { error: amenityError } = await authedSupabase.from('listing_amenities').insert(rows);
    if (amenityError) {
      console.error('Failed to insert amenities:', amenityError);
    }
  }

  return NextResponse.json({ listing_id: listingId }, { status: 201 });
}
