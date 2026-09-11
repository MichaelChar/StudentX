import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';
import { transformListing } from '@/lib/transformListing';
import { rankSimilarListings } from '@/lib/similarListings';

const LISTING_SELECT = `
  listing_id,
  listing_status,
  flags,
  title,
  description,
  photos,
  floor,
  sqm,
  bedrooms,
  bathrooms,
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
  landlords ( name, is_verified, profile_photo_url, avg_response_ms, response_stats_at ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) ),
  listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) ),
  property_verifications ( verification_id, method, verified_at )
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
  landlords ( name, is_verified, profile_photo_url, avg_response_ms, response_stats_at ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) ),
  property_verifications ( verification_id, method, verified_at )
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
    /*
      PAUSED LISTINGS ARE SOFT-HIDDEN, NOT 404'd (issue #205).

      This query deliberately does NOT pin listing_status = 'active' the way
      every other public query does. A landlord who pauses a listing — the
      dashboard's Pause control, which sets listing_status = 'disabled' via
      flagsForDisableToggle — is saying "not right now", not "gone". 404ing
      would break every link a student already has and drop the page out of
      the index each time, for a listing that is expected to come back. That
      is the whole reason pause exists instead of delete.

      So the filtering moves below, and it distinguishes two cases that a
      single `listing_status` check cannot:

        - PAUSED: was publicly live once (flags.admin_live_approved), now
          disabled. Render the page with an "unavailable" state, no booking
          CTA, and noindex while it lasts.
        - NEVER PUBLIC: draft, submitted-awaiting-review, or admin-disabled
          before approval. 404 exactly as before — these have no audience to
          preserve a link for, and showing them would leak listings the
          go-live gate has not passed.

      admin_live_approved is the right discriminator because it is stamped by
      /api/admin/listing-go-live and nothing landlord-reachable can set it,
      so this cannot become a way to surface an unapproved listing.
    */
    const { data, error } = await getSupabase()
      .from('listings')
      .select(LISTING_SELECT)
      .eq('listing_id', id)
      .single();

    if (error || !data) return null;

    if (data.listing_status !== 'active') {
      const wasLive = data.flags?.admin_live_approved === true;
      const landlordPaused = data.listing_status === 'disabled' && wasLive;
      if (!landlordPaused) return null;
      return { ...transformListing(data), paused: true };
    }

    return { ...transformListing(data), paused: false };
  } catch {
    return null;
  }
});

/**
 * Candidate pool for the detail-page "Similar" rail — the DB half.
 *
 * Takes the listing ID, NOT the resolved listing, and that is the whole
 * point: the candidate query needs nothing from the current listing
 * except to exclude it, so it must not wait on getListingForRender.
 * Splitting fetch from rank lets the page fire both queries at once
 * (see the Promise.all in the listing page) instead of paying two
 * serial Supabase round-trips on every uncached PDP render.
 *
 * Ranking — which genuinely does need the current listing, for its
 * neighbourhood and price — happens afterwards in rankSimilarCandidates,
 * synchronously and against the pool this returns.
 */
export const getSimilarCandidates = cache(async (id) => {
  if (!id) return [];
  try {
    const { data, error } = await getSupabase()
      .from('listings')
      .select(SIMILAR_LISTING_SELECT)
      .eq('listing_status', 'active')
      .neq('listing_id', id)
      .limit(SIMILAR_CANDIDATE_LIMIT);

    if (error || !data) return [];
    return data.map((row) => transformListing(row));
  } catch {
    return [];
  }
});

/**
 * Rank a pool from getSimilarCandidates against the resolved listing.
 * Pure and synchronous — rankSimilarListings re-excludes current.listing_id
 * itself, so the .neq() above is an optimisation, not the correctness check.
 *
 * @param {Array<object>} candidates
 * @param {object|null} current
 */
export function rankSimilarCandidates(candidates, current) {
  if (!current?.listing_id || !Array.isArray(candidates)) return [];
  return rankSimilarListings(candidates, current, SIMILAR_DISPLAY_LIMIT);
}
