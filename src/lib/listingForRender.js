import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';
import { transformListing } from '@/lib/transformListing';

const LISTING_SELECT = `
  listing_id,
  description,
  photos,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name, contact_info, verified_tier, is_verified ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

// Fallback SELECT without verified_tier for branch DBs that haven't run
// the pricing-pivot migration. Mirrors src/app/api/listings/[id]/route.js
// so the page server fetcher never 500s on a half-migrated environment.
const LISTING_SELECT_FALLBACK = `
  listing_id,
  description,
  photos,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name, contact_info ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
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
    let { data, error } = await getSupabase()
      .from('listings')
      .select(LISTING_SELECT)
      .eq('listing_id', id)
      .single();

    // verified_tier missing on this DB (e.g. dev branch without #28-era
    // pricing pivot) — retry without it.
    if (error && error.code !== 'PGRST116') {
      const fallback = await getSupabase()
        .from('listings')
        .select(LISTING_SELECT_FALLBACK)
        .eq('listing_id', id)
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) return null;
    return transformListing(data);
  } catch {
    return null;
  }
});
