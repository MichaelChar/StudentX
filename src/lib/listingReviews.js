import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';

// Per-request memoized review fetch for the listing detail page.
// Mirrors the query in src/app/api/listings/[id]/reviews/route.js so
// the server-rendered review list and the public API return the same
// shape. Wrapping in React's `cache()` lets this be called from both
// the page and any future co-located server component during the same
// render pass without re-querying Supabase.
//
// Returns { reviews, avg_rating, review_count } — same shape the old
// client-side <ReviewList> consumed via fetch(). On any error we
// degrade to an empty result rather than throwing, so a transient
// review-table issue can't blow up the whole listing render.
export const getListingReviews = cache(async (listingId) => {
  const empty = { reviews: [], avg_rating: null, review_count: 0 };
  if (!listingId || !/^\d[\d-]+$/.test(listingId)) return empty;

  try {
    const { data: reviews, error } = await getSupabase()
      .from('reviews')
      .select('review_id, rating, review_text, created_at, user_email')
      .eq('listing_id', listingId)
      .eq('moderated', false)
      .order('created_at', { ascending: false });

    if (error || !reviews) return empty;

    let avg_rating = null;
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      avg_rating = Math.round((sum / reviews.length) * 10) / 10;
    }

    const sanitised = reviews.map((r) => {
      const [local, domain] = (r.user_email || '').split('@');
      const masked_email =
        (local ? local.charAt(0) : '') + '***@' + (domain || '');
      return {
        review_id: r.review_id,
        rating: r.rating,
        review_text: r.review_text,
        created_at: r.created_at,
        masked_email,
      };
    });

    return {
      reviews: sanitised,
      avg_rating,
      review_count: reviews.length,
    };
  } catch {
    return empty;
  }
});
