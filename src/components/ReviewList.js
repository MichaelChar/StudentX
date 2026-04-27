import { getTranslations } from 'next-intl/server';
import StarRating from '@/components/StarRating';
import ReviewForm from '@/components/ReviewForm';
import ReportReviewButton from '@/components/ReportReviewButton';

/**
 * ReviewList — server component. Renders the review summary, the list
 * of reviews, and the (client) submit form. The data is fetched on
 * the server (see src/lib/listingReviews.js) and passed in as props,
 * so reviews ship in the SSR HTML for crawlers + first paint instead
 * of arriving via a post-mount fetch.
 *
 * Per-row interactive affordances (the "report" button) live in the
 * <ReportReviewButton> client island. The "write a review" form
 * remains a client component because it owns its own form state.
 */
export default async function ReviewList({
  listingId,
  reviews = [],
  avgRating = null,
  reviewCount = 0,
}) {
  const t = await getTranslations('reviews');

  return (
    <div className="space-y-6">
      {/* Header + average badge */}
      <div className="flex items-center justify-between">
        <h2 className="uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50">
          {t('title')}
        </h2>
        {avgRating !== null && (
          <div className="flex items-center gap-2">
            <StarRating value={Math.round(avgRating)} size="sm" />
            <span className="text-sm font-semibold text-navy">
              {avgRating.toFixed(1)}
            </span>
            <span className="text-xs text-gray-dark/50">({reviewCount})</span>
          </div>
        )}
      </div>

      {/* Review list */}
      {reviews.length === 0 ? (
        <p className="text-sm text-gray-dark/50 italic">{t('noReviews')}</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.review_id}
              className="rounded-xl border border-gray-200 bg-white p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <StarRating value={review.rating} size="sm" />
                <span className="text-xs text-gray-dark/40">
                  {new Date(review.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-dark/80 leading-relaxed">
                {review.review_text}
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-dark/40">
                  {review.masked_email}
                </span>
                <ReportReviewButton reviewId={review.review_id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit form (client island) */}
      <ReviewForm listingId={listingId} />
    </div>
  );
}
