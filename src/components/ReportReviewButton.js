'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * ReportReviewButton — small client island for reporting an abusive
 * review. Posts to /api/reviews/[id]/report and locally marks itself
 * "reported" so the user gets immediate feedback. Extracted out of
 * ReviewList so the surrounding list can render on the server.
 */
export default function ReportReviewButton({ reviewId }) {
  const t = useTranslations('reviews');
  const [reported, setReported] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (reported || pending) return;
    setPending(true);
    try {
      await fetch(`/api/reviews/${reviewId}/report`, { method: 'POST' });
      setReported(true);
    } catch {
      // silent — non-critical
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={reported || pending}
      className="text-xs text-gray-dark/30 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      {reported ? t('reported') : t('report')}
    </button>
  );
}
