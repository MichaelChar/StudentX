import { responseTimeBucket } from '@/lib/responseTimeBucket';

/*
  The public profile's stat column — parity Feature 49 addendum.

  Two of the six deleted dashboard tiles were re-homed here: ACTIVE LISTINGS
  and AVG. RESPONSE TIME. On the dashboard they scored the landlord; on their
  public profile they are evidence a student weighs before writing — which is
  the addendum's whole point about metrics doing work rather than reporting a
  score.

  There is no review count. Feature 34 (reviews) is skipped, so a third stat
  would have to be invented.

  A stat is OMITTED, never shown as unknown. `responseTimeBucket` already
  returns null when the figure is missing, stale (>7 days) or slower than two
  days: "we usually reply eventually" is not evidence, and a dash sitting in an
  evidence column reads as a fault rather than as an absence.

  Returns message KEYS, not copy, so next-intl stays the only place strings
  live and the profile can never disagree with the PDP host card about the
  same landlord.
*/

/** responseTimeBucket() value → the message key that renders it. */
export const REPLY_BUCKET_KEYS = {
  within_hour: 'replyWithinHour',
  within_day: 'replyWithinDay',
  within_2_days: 'replyWithin2Days',
};

/**
 * @param {{
 *   landlord: { avg_response_ms?: number|null, response_stats_at?: string|null },
 *   activeListingCount: number,
 *   now?: number|Date,
 * }} args
 * @returns {Array<{ key: string, valueKey?: string, count?: number, labelKey: string }>}
 */
export function landlordProfileStats({ landlord, activeListingCount, now } = {}) {
  const count = Number.isFinite(activeListingCount) ? activeListingCount : 0;

  const stats = [
    { key: 'activeListings', count, labelKey: 'statActiveListings' },
  ];

  const bucket = responseTimeBucket(
    landlord?.avg_response_ms,
    landlord?.response_stats_at,
    now ?? Date.now(),
  );
  if (bucket && REPLY_BUCKET_KEYS[bucket]) {
    stats.push({
      key: 'replies',
      valueKey: REPLY_BUCKET_KEYS[bucket],
      labelKey: 'statReplies',
    });
  }

  return stats;
}
