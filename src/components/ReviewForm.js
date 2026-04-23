'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import StarRating from '@/components/StarRating';

export default function ReviewForm({ listingId, onReviewSubmitted }) {
  const t = useTranslations('reviews');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user_email: '', rating: 0, review_text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.rating === 0) {
      setError(t('ratingRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          user_email: form.user_email,
          rating: form.rating,
          review_text: form.review_text,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('genericError'));
        return;
      }

      setSuccess(true);
      onReviewSubmitted?.();
    } catch {
      setError(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
        <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <p className="font-heading font-semibold text-green-800 text-sm">{t('successTitle')}</p>
        <p className="text-green-700/70 text-xs mt-1">{t('successDesc')}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-gray-200 text-navy font-heading font-semibold px-6 py-3 rounded-lg hover:bg-gray-light transition-colors tracking-wide cursor-pointer text-sm"
      >
        {t('writeReview')}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-navy text-sm uppercase tracking-wider">{t('writeReview')}</h3>
        <button
          onClick={() => setOpen(false)}
          aria-label={t('close')}
          className="text-gray-dark/40 hover:text-gray-dark transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Star rating */}
        <div>
          <label className="block text-xs text-gray-dark/60 mb-1.5">{t('yourRating')}</label>
          <StarRating
            value={form.rating}
            onChange={(r) => setForm((prev) => ({ ...prev, rating: r }))}
            interactive
            size="lg"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="review-email" className="sr-only">{t('yourEmail')}</label>
          <input
            id="review-email"
            name="user_email"
            type="email"
            required
            placeholder={t('emailPlaceholder')}
            value={form.user_email}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-200 bg-gray-light px-3.5 py-2.5 text-sm text-gray-dark placeholder:text-gray-dark/40 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
          />
        </div>

        {/* Review text */}
        <div>
          <label htmlFor="review-text" className="sr-only">{t('reviewText')}</label>
          <textarea
            id="review-text"
            name="review_text"
            required
            rows={4}
            minLength={10}
            maxLength={2000}
            placeholder={t('reviewPlaceholder')}
            value={form.review_text}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-200 bg-gray-light px-3.5 py-2.5 text-sm text-gray-dark placeholder:text-gray-dark/40 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold resize-none"
          />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-navy text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-navy/90 transition-colors tracking-wide cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-sm"
        >
          {submitting ? t('submitting') : t('submitReview')}
        </button>
      </form>
    </div>
  );
}
