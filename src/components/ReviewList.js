'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import StarRating from '@/components/StarRating';
import ReviewForm from '@/components/ReviewForm';

export default function ReviewList({ listingId }) {
  const t = useTranslations('reviews');
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reported, setReported] = useState({});

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/listings/${listingId}/reviews`);
      if (!res.ok) return;
      const data = await res.json();
      setReviews(data.reviews);
      setAvgRating(data.avg_rating);
      setReviewCount(data.review_count);
    } catch {
      // silent — non-critical
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  async function handleReport(reviewId) {
    if (reported[reviewId]) return;
    try {
      await fetch(`/api/reviews/${reviewId}/report`, { method: 'POST' });
      setReported((prev) => ({ ...prev, [reviewId]: true }));
    } catch {
      // silent
    }
  }

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
            <span className="text-xs text-gray-dark/50">
              ({reviewCount})
            </span>
          </div>
        )}
      </div>

      {/* Review list */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="h-4 w-24 bg-gray-light rounded" />
              <div className="h-3 w-full bg-gray-light rounded" />
              <div className="h-3 w-3/4 bg-gray-light rounded" />
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-dark/50 italic">{t('noReviews')}</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.review_id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <StarRating value={review.rating} size="sm" />
                <span className="text-xs text-gray-dark/40">
                  {new Date(review.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-dark/80 leading-relaxed">{review.review_text}</p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-dark/40">{review.masked_email}</span>
                <button
                  onClick={() => handleReport(review.review_id)}
                  disabled={!!reported[review.review_id]}
                  className="text-xs text-gray-dark/30 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {reported[review.review_id] ? t('reported') : t('report')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit form */}
      <ReviewForm listingId={listingId} onReviewSubmitted={fetchReviews} />
    </div>
  );
}
