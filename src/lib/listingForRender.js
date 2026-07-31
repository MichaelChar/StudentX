import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';
import { transformListing } from '@/lib/transformListing';

const LISTING_SELECT = `
  listing_id,
  title,
  description,
  photos,
  floor,
  sqm,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name, is_verified, profile_photo_url ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) ),
  listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) )
`;

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
      .single();

    if (error || !data) return null;
    return transformListing(data);
  } catch {
    return null;
  }
});
