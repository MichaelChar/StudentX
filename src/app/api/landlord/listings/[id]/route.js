import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  getSupabaseAsService,
} from '@/lib/supabaseServer';
import { landlordIdForUser } from '@/lib/landlordAuth';
import { recomputeMissingDistances } from '@/lib/recomputeDistances';
import { writeUniversityDistances } from '@/lib/universityDistances';
import { parseListingWriteBody } from '@/lib/landlordListingBody';
import {
  flagsForSubmit,
  flagsForDisableToggle,
  FLAGS_LIVE,
} from '@/lib/listingGoLive';


const SINGLE_LISTING_SELECT = `
  listing_id, landlord_id, title, rent_id, location_id, property_type_id,
  description, photos, external_photo_urls, sqm, floor, available_from,
  available_to, min_duration_months, max_duration_months,
  bedrooms, bathrooms, video_url,
  smoking_allowed, pets_allowed, additional_rules, listing_status, flags,
  rent ( rent_id, monthly_price, bills_included, deposit ),
  location ( location_id, address, neighborhood, lat, lng ),
  property_types ( property_type_id, name ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  listing_university_distances ( university_id, distance_meters, source ),
  property_verifications ( verification_id, method, status, verified_at, checklist_json, notes, created_at )
`;

const SINGLE_LISTING_SELECT_FALLBACK = `
  listing_id, landlord_id, title, rent_id, location_id, property_type_id,
  description, photos, sqm, floor, available_from, min_duration_months,
  rent ( rent_id, monthly_price, bills_included, deposit ),
  location ( location_id, address, neighborhood, lat, lng ),
  property_types ( property_type_id, name ),
  listing_amenities ( amenities ( amenity_id, name ) )
`;

export async function GET(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await landlordIdForUser(getSupabaseWithToken(token), user.id);
  if (!landlordId) {
    return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });
  }

  const { id } = await params;
  const authedSupabase = getSupabaseWithToken(token);

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

  // Blackout ranges for the availability step
  let blackouts = [];
  try {
    const { data: blocks } = await authedSupabase
      .from('listing_availability_blocks')
      .select('block_id, start_date, end_date, kind')
      .eq('listing_id', id)
      .eq('kind', 'blackout')
      .order('start_date');
    blackouts = blocks || [];
  } catch {
    blackouts = [];
  }

  return NextResponse.json({ listing: data, blackouts });
}

export async function PATCH(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await landlordIdForUser(getSupabaseWithToken(token), user.id);
  if (!landlordId) {
    return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });
  }

  const { id } = await params;
  const body = await request.json();
  const authedSupabase = getSupabaseWithToken(token);

  const { data: existing, error: fetchError } = await authedSupabase
    .from('listings')
    .select('listing_id, rent_id, location_id, flags')
    .eq('listing_id', id)
    .eq('landlord_id', landlordId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const isSubmit = body.submit === true;
  const isDraft = body.draft === true && !isSubmit;

  const parsed = await parseListingWriteBody(body, {
    partial: true,
    requireUniversities: isSubmit,
    requireCoords: body.lat !== undefined || body.lng !== undefined || isSubmit,
    requirePhotos: isSubmit,
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const d = parsed.data;

  // Rent
  if (
    d.monthly_price !== undefined ||
    d.bills_included !== undefined ||
    d.deposit !== undefined
  ) {
    const rentUpdate = {};
    if (d.monthly_price !== undefined) rentUpdate.monthly_price = d.monthly_price;
    if (d.bills_included !== undefined) rentUpdate.bills_included = d.bills_included;
    if (d.deposit !== undefined) rentUpdate.deposit = d.deposit;

    const { error: rentError } = await authedSupabase
      .from('rent')
      .update(rentUpdate)
      .eq('rent_id', existing.rent_id);

    if (rentError) {
      console.error('Failed to update rent:', rentError);
      return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
    }
  }

  // Location
  if (
    d.normalizedAddress !== undefined ||
    d.normalizedNeighborhood !== undefined ||
    d.lat !== undefined ||
    d.lng !== undefined
  ) {
    const locationUpdate = {};
    if (d.normalizedAddress !== undefined) locationUpdate.address = d.normalizedAddress;
    if (d.normalizedNeighborhood !== undefined) {
      locationUpdate.neighborhood = d.normalizedNeighborhood;
    }
    if (d.lat !== undefined) locationUpdate.lat = d.lat;
    if (d.lng !== undefined) locationUpdate.lng = d.lng;

    const { error: locationError } = await authedSupabase
      .from('location')
      .update(locationUpdate)
      .eq('location_id', existing.location_id);

    if (locationError) {
      console.error('Failed to update location:', locationError);
      return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
    }
  }

  let propertyTypeId;
  if (d.property_type !== undefined) {
    const { data: propType } = await getSupabase()
      .from('property_types')
      .select('property_type_id')
      .eq('name', d.property_type)
      .single();
    if (!propType) {
      return NextResponse.json({ error: 'Invalid property type' }, { status: 400 });
    }
    propertyTypeId = propType.property_type_id;
  }

  const listingUpdate = {};
  if (d.normalizedTitle !== undefined) listingUpdate.title = d.normalizedTitle;
  if (d.normalizedDescription !== undefined) {
    listingUpdate.description = d.normalizedDescription;
  }
  if (d.photos !== undefined) listingUpdate.photos = d.photos;
  if (d.external_photo_urls !== undefined) {
    listingUpdate.external_photo_urls = d.external_photo_urls;
  }
  if (d.sqm !== undefined) listingUpdate.sqm = d.sqm;
  if (d.floor !== undefined) listingUpdate.floor = d.floor;
  if (d.available_from !== undefined) listingUpdate.available_from = d.available_from;
  if (d.available_to !== undefined) listingUpdate.available_to = d.available_to;
  if (d.minDuration !== undefined) listingUpdate.min_duration_months = d.minDuration;
  if (d.maxDuration !== undefined) listingUpdate.max_duration_months = d.maxDuration;
  if (d.bedrooms !== undefined) listingUpdate.bedrooms = d.bedrooms;
  if (d.bathrooms !== undefined) listingUpdate.bathrooms = d.bathrooms;
  if (d.video_url !== undefined) listingUpdate.video_url = d.video_url;
  if (d.smoking_allowed !== undefined) listingUpdate.smoking_allowed = d.smoking_allowed;
  if (d.pets_allowed !== undefined) listingUpdate.pets_allowed = d.pets_allowed;
  if (d.additional_rules !== undefined) {
    listingUpdate.additional_rules = d.additional_rules;
  }
  if (propertyTypeId !== undefined) listingUpdate.property_type_id = propertyTypeId;
  // Landlords cannot set listing_status to active themselves — ignore client value.
  // Public active is admin go-live only (see /api/admin/listing-go-live).

  if (d.flags !== undefined || isSubmit || isDraft || body.disabled !== undefined) {
    const prev = existing.flags && typeof existing.flags === 'object' ? existing.flags : {};

    if (body.disabled !== undefined) {
      const toggled = flagsForDisableToggle(body.disabled === true, prev, existing.listing_status);
      listingUpdate.flags = toggled.flags;
      listingUpdate.listing_status = toggled.listing_status;
    } else if (isSubmit) {
      // Keep public live if already admin-approved and active; otherwise submit for review.
      const alreadyLive =
        existing.listing_status === 'active' && prev.admin_live_approved === true;
      if (alreadyLive) {
        listingUpdate.flags = {
          ...prev,
          ...(d.flags || {}),
          disabled: false,
          listing_status: FLAGS_LIVE,
          admin_live_approved: true,
        };
        listingUpdate.listing_status = 'active';
      } else {
        const submitted = flagsForSubmit({ ...prev, ...(d.flags || {}) });
        listingUpdate.flags = submitted.flags;
        listingUpdate.listing_status = submitted.listing_status;
      }
    } else {
      listingUpdate.flags = {
        ...prev,
        ...(d.flags || {}),
      };
      if (isDraft && listingUpdate.flags.listing_status == null) {
        listingUpdate.flags.listing_status = 'draft';
      }
      // Never let a partial draft write flip public status on.
      if (d.listing_status === 'active') {
        // ignore
      } else if (d.listing_status !== undefined) {
        listingUpdate.listing_status = d.listing_status;
      }
    }
  }

  if (Object.keys(listingUpdate).length > 0) {
    const { error: listingError } = await authedSupabase
      .from('listings')
      .update(listingUpdate)
      .eq('listing_id', id);

    if (listingError) {
      // Retry without marketplace columns if needed
      console.warn('Listing update failed, retrying lean:', listingError.message);
      const lean = { ...listingUpdate };
      delete lean.available_to;
      delete lean.max_duration_months;
      delete lean.bedrooms;
      delete lean.bathrooms;
      delete lean.video_url;
      delete lean.smoking_allowed;
      delete lean.pets_allowed;
      delete lean.additional_rules;
      delete lean.flags;
      delete lean.listing_status;
      delete lean.external_photo_urls;
      const retry = await authedSupabase
        .from('listings')
        .update(lean)
        .eq('listing_id', id);
      if (retry.error) {
        console.error('Failed to update listing:', retry.error);
        return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
      }
    }
  }

  if (d.universityDistanceRows !== undefined) {
    const { error: distanceError } = await writeUniversityDistances(
      authedSupabase,
      id,
      d.universityDistanceRows,
    );
    if (distanceError) {
      console.error('Failed to update university distances:', distanceError);
    }
  }

  if (d.amenity_ids !== undefined) {
    await authedSupabase.from('listing_amenities').delete().eq('listing_id', id);
    if (d.amenity_ids.length > 0) {
      const rows = d.amenity_ids.map((amenity_id) => ({
        listing_id: id,
        amenity_id,
      }));
      await authedSupabase.from('listing_amenities').insert(rows);
    }
  }

  if (d.blackouts !== undefined) {
    // Replace blackout rows only (leave booked/pending untouched).
    await authedSupabase
      .from('listing_availability_blocks')
      .delete()
      .eq('listing_id', id)
      .eq('kind', 'blackout');
    if (d.blackouts.length > 0) {
      await authedSupabase.from('listing_availability_blocks').insert(
        d.blackouts.map((b) => ({ ...b, listing_id: id })),
      );
    }
  }

  try {
    await recomputeMissingDistances({
      listingIds: [id],
      supabase: getSupabaseAsService(),
    });
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

  const landlordId = await landlordIdForUser(getSupabaseWithToken(token), user.id);
  if (!landlordId) {
    return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });
  }

  const { id } = await params;
  const authedSupabase = getSupabaseWithToken(token);

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
