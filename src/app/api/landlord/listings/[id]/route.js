import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';
import { recomputeMissingDistances } from '@/lib/recomputeDistances';
import { normalizeTitle } from '@/lib/listingTitle';

const ALLOWED_MIN_DURATIONS = [1, 5, 9];

function parseMinDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!ALLOWED_MIN_DURATIONS.includes(n)) {
    const err = new Error('min_duration_months must be 1, 5, or 9');
    err.code = 'INVALID_MIN_DURATION';
    throw err;
  }
  return n;
}

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

  const SINGLE_LISTING_SELECT = `
    listing_id, landlord_id, title, rent_id, location_id, property_type_id,
    description, photos, sqm, floor, available_from, min_duration_months,
    rent ( rent_id, monthly_price, bills_included, deposit ),
    location ( location_id, address, neighborhood, lat, lng ),
    property_types ( property_type_id, name ),
    listing_amenities ( amenities ( amenity_id, name ) )
  `;
  // Pre-migration fallback: keep in sync with SINGLE_LISTING_SELECT minus
  // any column that may not yet exist in prod (see route.js sibling for
  // the same guard on the list-GET path).
  const SINGLE_LISTING_SELECT_FALLBACK = `
    listing_id, landlord_id, title, rent_id, location_id, property_type_id,
    description, photos, sqm, floor, available_from,
    rent ( rent_id, monthly_price, bills_included, deposit ),
    location ( location_id, address, neighborhood, lat, lng ),
    property_types ( property_type_id, name ),
    listing_amenities ( amenities ( amenity_id, name ) )
  `;

  let { data, error } = await authedSupabase
    .from('listings')
    .select(SINGLE_LISTING_SELECT)
    .eq('listing_id', id)
    .eq('landlord_id', landlordId)
    .single();

  if (error) {
    const fallback = await authedSupabase
      .from('listings')
      .select(SINGLE_LISTING_SELECT_FALLBACK)
      .eq('listing_id', id)
      .eq('landlord_id', landlordId)
      .single();

    if (fallback.error || !fallback.data) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    data = fallback.data;
  }

  if (!data) {
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

  // Update listing row
  const listingUpdate = {};
  if (body.is_featured !== undefined) listingUpdate.is_featured = !!body.is_featured;
  // Title semantics:
  //   undefined → leave alone (don't include in update)
  //   null OR empty-after-normalization → 400 (cannot clear a required field)
  //   too long → 400
  //   otherwise → set normalized value
  if (body.title !== undefined) {
    let normalizedTitle;
    try {
      normalizedTitle = normalizeTitle(body.title);
    } catch (err) {
      if (err.code === 'TITLE_TOO_LONG') {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    if (!normalizedTitle) {
      return NextResponse.json(
        { error: 'title cannot be empty' },
        { status: 400 }
      );
    }
    listingUpdate.title = normalizedTitle;
  }
  if (body.description !== undefined) listingUpdate.description = body.description || null;
  if (body.photos !== undefined) listingUpdate.photos = body.photos;
  if (body.sqm !== undefined) listingUpdate.sqm = body.sqm || null;
  if (body.floor !== undefined) listingUpdate.floor = body.floor != null && body.floor !== '' ? parseInt(body.floor, 10) : null;
  if (body.available_from !== undefined) listingUpdate.available_from = body.available_from || null;
  if (body.min_duration_months !== undefined) {
    try {
      listingUpdate.min_duration_months = parseMinDuration(body.min_duration_months);
    } catch (err) {
      if (err.code === 'INVALID_MIN_DURATION') {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }
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

  // Heal any missing faculty_distances rows after the edit. Idempotent — when
  // coords didn't change and rows already exist, this is a cheap DB read with
  // no OSRM call. Non-fatal: swallowed so a flaky OSRM never fails edit.
  try {
    await recomputeMissingDistances({ listingIds: [id] });
  } catch (err) {
    console.error('[landlord/listings PATCH] inline distance recompute failed:', err);
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
