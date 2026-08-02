import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';
import { transformListing } from '@/lib/transformListing';
import { rankSimilarListings } from '@/lib/similarListings';

const LISTING_SELECT = `
  listing_id,
  title,
  description,
  photos,
  floor,
  sqm,
  bedrooms,
  bathrooms,
  agency_fee,
  available_from,
  available_to,
  min_duration_months,
  max_duration_months,
  smoking_allowed,
  pets_allowed,
  additional_rules,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name, is_verified, profile_photo_url, avg_response_ms ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) ),
  listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) )
`;

// Slimmer select for the similar-listings rail — same public shape via
// transformListing, without amenities / faculty distances we never render.
const SIMILAR_LISTING_SELECT = `
  listing_id,
  title,
  description,
  photos,
  floor,
  sqm,
  bedrooms,
  bathrooms,
  agency_fee,
  available_from,
  available_to,
  min_duration_months,
  max_duration_months,
  smoking_allowed,
  pets_allowed,
  additional_rules,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name, is_verified, profile_photo_url, avg_response_ms ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) )
`;

const SIMILAR_CANDIDATE_LIMIT = 40;
const SIMILAR_DISPLAY_LIMIT = 4;

// Per-request memoized listing fetch. Both the listing layout (for
// metadata + JSON-LD) and the listing page (for body content) call this
// during the same render pass; React's `cache()` deduplicates so we hit
// Supabase once per request instead of twice. The transformed shape
// matches `transformListing` — same as the public /api/listings/[id]
// route — so the layout's metadata helpers and the page's render code
// share one schema.
export const getListingForRender = cache(async (id) => {
  if (!id || !/^\d[\d-]+$/.test(id)) return null;
  try {
    const { data, error } = await getSupabase()
      .from('listings')
      .select(LISTING_SELECT)
      .eq('listing_id', id)
      .eq('listing_status', 'active')
      .single();

    if (error || !data) return null;
    return transformListing(data);
  } catch {
    return null;
  }
});

/**
 * Other active listings for the detail-page "Similar" rail.
 * Active-only, excludes `current.listing_id`, ranked by same neighbourhood
 * then closest monthly price (see rankSimilarListings).
 */
export const getSimilarListings = cache(async (current) => {
  if (!current?.listing_id) return [];
  try {
    const { data, error } = await getSupabase()
      .from('listings')
      .select(SIMILAR_LISTING_SELECT)
      .eq('listing_status', 'active')
      .neq('listing_id', current.listing_id)
      .limit(SIMILAR_CANDIDATE_LIMIT);

    if (error || !data) return [];
    const candidates = data.map((row) => transformListing(row));
    return rankSimilarListings(candidates, current, SIMILAR_DISPLAY_LIMIT);
  } catch {
    return [];
  }
});
