import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';
import { canFeatureListing } from '@/lib/stripe';

async function getLandlordId(userId) {
  const { data } = await getSupabase()
    .from('landlords')
    .select('landlord_id')
    .eq('auth_user_id', userId)
    .single();
  return data?.landlord_id ?? null;
}

export async function GET(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const { id } = await params;
  const authedSupabase = getSupabaseWithToken(token);
  const { data, error } = await authedSupabase
    .from('listings')
    .select(`
      listing_id, landlord_id, rent_id, location_id, property_type_id,
      description, photos, sqm, floor, available_from, rental_duration,
      rent ( rent_id, monthly_price, bills_included, deposit ),
      location ( location_id, address, neighborhood, lat, lng ),
      property_types ( property_type_id, name ),
      listing_amenities ( amenities ( amenity_id, name ) )
    `)
    .eq('listing_id', id)
    .eq('landlord_id', landlordId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  return NextResponse.json({ listing: data });
}

export async function PATCH(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const { id } = await params;
  const body = await request.json();
  const authedSupabase = getSupabaseWithToken(token);

  // Verify ownership and get rent_id / location_id
  const { data: existing, error: fetchError } = await authedSupabase
    .from('listings')
    .select('listing_id, rent_id, location_id')
    .eq('listing_id', id)
    .eq('landlord_id', landlordId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  // Update rent
  if (body.monthly_price !== undefined || body.bills_included !== undefined || body.deposit !== undefined) {
    const rentUpdate = {};
    if (body.monthly_price !== undefined) rentUpdate.monthly_price = body.monthly_price || null;
    if (body.bills_included !== undefined) rentUpdate.bills_included = body.bills_included;
    if (body.deposit !== undefined) rentUpdate.deposit = body.deposit || 0;

    const { error: rentError } = await authedSupabase
      .from('rent')
      .update(rentUpdate)
      .eq('rent_id', existing.rent_id);

    if (rentError) {
      console.error('Failed to update rent:', rentError);
      return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
    }
  }

  // Update location
  if (body.address !== undefined || body.neighborhood !== undefined || body.lat !== undefined || body.lng !== undefined) {
    const locationUpdate = {};
    if (body.address !== undefined) locationUpdate.address = body.address;
    if (body.neighborhood !== undefined) locationUpdate.neighborhood = body.neighborhood;
    if (body.lat !== undefined) locationUpdate.lat = parseFloat(body.lat);
    if (body.lng !== undefined) locationUpdate.lng = parseFloat(body.lng);

    const { error: locationError } = await authedSupabase
      .from('location')
      .update(locationUpdate)
      .eq('location_id', existing.location_id);

    if (locationError) {
      console.error('Failed to update location:', locationError);
      return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
    }
  }

  // Update property_type_id if changed
  let propertyTypeId;
  if (body.property_type !== undefined) {
    const { data: propType } = await getSupabase()
      .from('property_types')
      .select('property_type_id')
      .eq('name', body.property_type)
      .single();
    if (!propType) return NextResponse.json({ error: 'Invalid property type' }, { status: 400 });
    propertyTypeId = propType.property_type_id;
  }

  // Check featured toggle permission
  if (body.is_featured !== undefined) {
    if (body.is_featured) {
      const featureCheck = await canFeatureListing(getSupabase(), landlordId);
      if (!featureCheck.allowed) {
        return NextResponse.json(
          { error: featureCheck.reason, upgrade: true, planId: featureCheck.planId },
          { status: 403 }
        );
      }
    }
  }

  // Update listing row
  const listingUpdate = {};
  if (body.is_featured !== undefined) listingUpdate.is_featured = !!body.is_featured;
  if (body.description !== undefined) listingUpdate.description = body.description || null;
  if (body.photos !== undefined) listingUpdate.photos = body.photos;
  if (body.sqm !== undefined) listingUpdate.sqm = body.sqm || null;
  if (body.floor !== undefined) listingUpdate.floor = body.floor != null && body.floor !== '' ? parseInt(body.floor, 10) : null;
  if (body.available_from !== undefined) listingUpdate.available_from = body.available_from || null;
  if (body.rental_duration !== undefined) listingUpdate.rental_duration = body.rental_duration || null;
  if (propertyTypeId !== undefined) listingUpdate.property_type_id = propertyTypeId;

  if (Object.keys(listingUpdate).length > 0) {
    const { error: listingError } = await authedSupabase
      .from('listings')
      .update(listingUpdate)
      .eq('listing_id', id);

    if (listingError) {
      console.error('Failed to update listing:', listingError);
      return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
    }
  }

  // Replace amenities if provided
  if (body.amenity_ids !== undefined) {
    await authedSupabase.from('listing_amenities').delete().eq('listing_id', id);
    if (body.amenity_ids.length > 0) {
      const rows = body.amenity_ids.map((amenity_id) => ({ listing_id: id, amenity_id }));
      await authedSupabase.from('listing_amenities').insert(rows);
    }
  }

  return NextResponse.json({ listing_id: id });
}

export async function DELETE(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const { id } = await params;
  const authedSupabase = getSupabaseWithToken(token);

  // Delete listing — trigger cleanup_listing_orphans handles rent + location
  const { error } = await authedSupabase
    .from('listings')
    .delete()
    .eq('listing_id', id)
    .eq('landlord_id', landlordId);

  if (error) {
    console.error('Failed to delete listing:', error);
    return NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 });
  }

  return NextResponse.json({ deleted: id });
}
