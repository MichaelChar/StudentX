import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  getSupabaseAsService,
} from '@/lib/supabaseServer';
import { writeUniversityDistances } from '@/lib/universityDistances';

async function getLandlordId(userId) {
  const { data } = await getSupabaseAsService()
    .from('landlords')
    .select('landlord_id')
    .eq('auth_user_id', userId)
    .single();
  return data?.landlord_id ?? null;
}

/**
 * Duplicate a listing for multi-room stock ("… – Room 1 / Room 2").
 * Copies location/rent/details into a new draft; photos are shared URLs
 * (storage objects are not re-uploaded).
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

  const { id } = await params;
  const authedSupabase = getSupabaseWithToken(token);
  const supabase = getSupabaseAsService();

  const { data: src, error: srcError } = await authedSupabase
    .from('listings')
    .select(`
      listing_id, landlord_id, title, rent_id, location_id, property_type_id,
      description, photos, external_photo_urls, sqm, floor, available_from,
      available_to, min_duration_months, max_duration_months,
      bedrooms, bathrooms, video_url,
      smoking_allowed, pets_allowed, additional_rules, flags,
      rent ( monthly_price, currency, bills_included, deposit ),
      location ( address, neighborhood, lat, lng ),
      listing_amenities ( amenity_id ),
      listing_university_distances ( university_id, distance_meters, source )
    `)
    .eq('listing_id', id)
    .eq('landlord_id', landlordId)
    .single();

  if (srcError || !src) {
    // Leaner fallback for pre-100 schemas
    const fallback = await authedSupabase
      .from('listings')
      .select(`
        listing_id, landlord_id, title, rent_id, location_id, property_type_id,
        description, photos, sqm, floor, available_from, min_duration_months,
        rent ( monthly_price, currency, bills_included, deposit ),
        location ( address, neighborhood, lat, lng ),
        listing_amenities ( amenity_id )
      `)
      .eq('listing_id', id)
      .eq('landlord_id', landlordId)
      .single();
    if (fallback.error || !fallback.data) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    return duplicateFrom(fallback.data, { landlordId, authedSupabase, supabase });
  }

  return duplicateFrom(src, { landlordId, authedSupabase, supabase });
}

async function duplicateFrom(src, { landlordId, authedSupabase, supabase }) {
  const { data: rentData, error: rentError } = await supabase
    .from('rent')
    .insert({
      monthly_price: src.rent?.monthly_price ?? null,
      currency: src.rent?.currency || 'EUR',
      bills_included: src.rent?.bills_included ?? false,
      deposit: src.rent?.deposit ?? 0,
    })
    .select('rent_id')
    .single();
  if (rentError) {
    console.error('duplicate rent:', rentError);
    return NextResponse.json({ error: 'Failed to duplicate listing' }, { status: 500 });
  }

  // location.lat/lng are NOT NULL (migration 106). Refuse to duplicate a
  // source that somehow lacks coordinates rather than inserting nulls.
  const srcLat = src.location?.lat;
  const srcLng = src.location?.lng;
  if (
    srcLat == null ||
    srcLng == null ||
    !Number.isFinite(Number(srcLat)) ||
    !Number.isFinite(Number(srcLng))
  ) {
    return NextResponse.json(
      { error: 'Source listing is missing coordinates' },
      { status: 400 },
    );
  }

  const { data: locationData, error: locationError } = await supabase
    .from('location')
    .insert({
      address: src.location?.address || 'Thessaloniki',
      neighborhood: src.location?.neighborhood || 'Center',
      lat: Number(srcLat),
      lng: Number(srcLng),
    })
    .select('location_id')
    .single();
  if (locationError) {
    console.error('duplicate location:', locationError);
    return NextResponse.json({ error: 'Failed to duplicate listing' }, { status: 500 });
  }

  const { data: maxRow } = await getSupabase()
    .from('listings')
    .select('listing_id')
    .eq('landlord_id', landlordId)
    .order('listing_id', { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (maxRow?.length > 0) {
    nextSeq = parseInt(maxRow[0].listing_id.slice(4), 10) + 1;
  }
  if (nextSeq > 999) {
    return NextResponse.json({ error: 'Maximum of 999 listings reached' }, { status: 400 });
  }
  const listingId = landlordId + String(nextSeq).padStart(3, '0');

  const baseTitle = (src.title || src.location?.address || 'Listing').trim();
  const copyTitle =
    baseTitle.length + 7 <= 80 ? `${baseTitle} (copy)` : `${baseTitle.slice(0, 72)} (copy)`;

  const insert = {
    listing_id: listingId,
    landlord_id: landlordId,
    title: copyTitle,
    rent_id: rentData.rent_id,
    location_id: locationData.location_id,
    property_type_id: src.property_type_id,
    description: src.description,
    photos: src.photos || [],
    external_photo_urls: src.external_photo_urls || [],
    sqm: src.sqm ?? null,
    floor: src.floor ?? null,
    available_from: src.available_from ?? null,
    available_to: src.available_to ?? null,
    min_duration_months: src.min_duration_months ?? null,
    max_duration_months: src.max_duration_months ?? null,
    bedrooms: src.bedrooms ?? null,
    bathrooms: src.bathrooms ?? null,
    video_url: src.video_url ?? null,
    smoking_allowed: src.smoking_allowed ?? null,
    pets_allowed: src.pets_allowed ?? null,
    additional_rules: src.additional_rules ?? null,
    listing_status: 'disabled',
    flags: { listing_status: 'draft', disabled: false, duplicated_from: src.listing_id },
  };

  let { error: listingError } = await authedSupabase
    .from('listings')
    .insert(insert)
    .select('listing_id')
    .single();

  if (listingError) {
    const lean = {
      listing_id: listingId,
      landlord_id: landlordId,
      title: copyTitle,
      rent_id: rentData.rent_id,
      location_id: locationData.location_id,
      property_type_id: src.property_type_id,
      description: src.description,
      photos: src.photos || [],
      sqm: src.sqm ?? null,
      floor: src.floor ?? null,
      available_from: src.available_from ?? null,
      min_duration_months: src.min_duration_months ?? null,
    };
    const retry = await authedSupabase.from('listings').insert(lean).select('listing_id').single();
    if (retry.error) {
      console.error('duplicate listing:', retry.error);
      return NextResponse.json({ error: 'Failed to duplicate listing' }, { status: 500 });
    }
  }

  const amenityIds = (src.listing_amenities || [])
    .map((la) => la.amenity_id)
    .filter(Boolean);
  if (amenityIds.length > 0) {
    await authedSupabase.from('listing_amenities').insert(
      amenityIds.map((amenity_id) => ({ listing_id: listingId, amenity_id })),
    );
  }

  const uniRows = (src.listing_university_distances || []).map((r) => ({
    university_id: r.university_id,
    distance_meters: r.distance_meters,
    source: r.source === 'computed' ? 'computed' : 'landlord',
  }));
  if (uniRows.length > 0) {
    await writeUniversityDistances(authedSupabase, listingId, uniRows);
  }

  return NextResponse.json({ listing_id: listingId }, { status: 201 });
}
