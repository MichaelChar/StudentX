import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';
import { transformListing } from '@/lib/transformListing';

// Public-safe landlord columns ONLY. contact_info / email / stripe_customer_id
// / auth_user_id are owner-only PII (security audit #1 — PRs #223/#224) and must
// never be selected on this anon/public path. profile_photo_url was granted to
// anon in migration 057; created_at powers the "member since" line.
const LANDLORD_SELECT =
  'landlord_id, name, verified_tier, is_verified, verified_tier_rank, profile_photo_url, created_at';

// Fallback for an environment that hasn't run migration 057 yet (no
// profile_photo_url column/grant). The verified gate still works — only the
// avatar is missing and the UI falls back to a monogram.
const LANDLORD_SELECT_FALLBACK =
  'landlord_id, name, verified_tier, is_verified, verified_tier_rank, created_at';

// Listings for one landlord — mirrors the public /api/listings shape so the
// reused <ListingCard> renders identically. Main select carries
// profile_photo_url (added in #057); fallback drops the newest columns so a
// half-migrated DB never 500s the profile page.
const LISTINGS_SELECT = `
  listing_id,
  is_featured,
  title,
  description,
  photos,
  floor,
  min_duration_months,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name, verified_tier, is_verified, verified_tier_rank, profile_photo_url ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

const LISTINGS_SELECT_FALLBACK = `
  listing_id,
  title,
  description,
  photos,
  floor,
  rent ( monthly_price, currency, bills_included, deposit ),
  location ( address, neighborhood, lat, lng ),
  property_types ( name ),
  landlords ( name ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

// A profile is a verified-tier perk. Same predicate the listing detail page and
// ListingCard use to decide the verified styling, kept in one place here.
export function isVerifiedLandlord(landlord) {
  return Boolean(
    landlord &&
      landlord.is_verified === true &&
      landlord.verified_tier &&
      landlord.verified_tier !== 'none',
  );
}

/**
 * Public landlord-profile fetch for the student-facing
 * /property/[city]/landlords/[landlordId] page.
 *
 * Returns `{ landlord, listings }` for a VERIFIED landlord, or `null` when the
 * landlord doesn't exist or isn't verified (profiles are verified-only — the
 * page calls notFound() on null). Reads through the anon client and selects
 * only public-safe columns. Memoized per-request like getListingForRender so a
 * layout's metadata pass and the page body share one round-trip.
 *
 * @param {string} landlordId 4-digit landlord identifier (the LLLL prefix of a listing_id)
 */
export const getLandlordProfile = cache(async (landlordId) => {
  // landlord_id is the documented 4-digit identifier (see docs/schema.md).
  if (!landlordId || !/^\d{4}$/.test(landlordId)) return null;

  const supabase = getSupabase();
  try {
    // --- Landlord row (public-safe columns + verified gate) ---
    let { data: landlord, error } = await supabase
      .from('landlords')
      .select(LANDLORD_SELECT)
      .eq('landlord_id', landlordId)
      .single();

    // PGRST116 = no row; anything else may be a missing column on a
    // half-migrated DB — retry with the pre-#057 column set.
    if (error && error.code !== 'PGRST116') {
      const fb = await supabase
        .from('landlords')
        .select(LANDLORD_SELECT_FALLBACK)
        .eq('landlord_id', landlordId)
        .single();
      landlord = fb.data;
      error = fb.error;
    }

    if (error || !landlord) return null;
    if (!isVerifiedLandlord(landlord)) return null;

    // --- Their listings (same shape as the public directory) ---
    // Single landlord ⇒ verified_tier_rank is constant, so order is just
    // featured-first then newest (listing_id's per-landlord sequence increases
    // with recency — see the LLLLNNN format in docs/schema.md).
    let { data: rows, error: listErr } = await supabase
      .from('listings')
      .select(LISTINGS_SELECT)
      .eq('landlord_id', landlordId)
      .order('is_featured', { ascending: false })
      .order('listing_id', { ascending: false });

    if (listErr) {
      const fb = await supabase
        .from('listings')
        .select(LISTINGS_SELECT_FALLBACK)
        .eq('landlord_id', landlordId)
        .order('listing_id', { ascending: false });
      rows = fb.data;
      listErr = fb.error;
    }

    const listings = (rows || []).map(transformListing);

    return {
      landlord: {
        landlord_id: landlord.landlord_id,
        name: landlord.name ?? null,
        verified_tier: landlord.verified_tier ?? 'none',
        is_verified: landlord.is_verified ?? false,
        profile_photo_url: landlord.profile_photo_url ?? null,
        created_at: landlord.created_at ?? null,
      },
      listings,
    };
  } catch {
    return null;
  }
});
