/**
 * Public display buckets for landlords.avg_response_ms.
 *
 * Never show raw milliseconds. Returns a stable message key (not copy) so
 * callers can pass it through next-intl, or null when the stat should be
 * omitted (unknown, stale, or slower than two days).
 *
 * Buckets (upper bounds inclusive):
 *   within_hour  — avg ≤ 1 hour
 *   within_day   — avg ≤ 24 hours
 *   within_2_days — avg ≤ 48 hours
 *   null         — avg null/invalid, > 48h, or stats older than ~7 days
 *
 * Freshness: when `response_stats_at` is provided, omit if older than
 * STALE_AFTER_MS. When it is null/undefined (column not on the public
 * payload — anon has no SELECT grant), only avg_response_ms is considered.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Omit the stat when last recompute is older than this (~7 days). */
export const RESPONSE_STATS_STALE_MS = 7 * DAY_MS;

export const RESPONSE_BUCKET_WITHIN_HOUR = 'within_hour';
export const RESPONSE_BUCKET_WITHIN_DAY = 'within_day';
export const RESPONSE_BUCKET_WITHIN_2_DAYS = 'within_2_days';

/**
 * @param {number|null|undefined} avgResponseMs
 * @param {string|Date|null|undefined} responseStatsAt  ISO timestamp or Date
 * @param {Date|number} [now=Date.now()]  injectable for tests
 * @returns {'within_hour'|'within_day'|'within_2_days'|null}
 */
export function responseTimeBucket(
  avgResponseMs,
  responseStatsAt = null,
  now = Date.now(),
) {
  if (avgResponseMs == null || !Number.isFinite(avgResponseMs) || avgResponseMs < 0) {
    return null;
  }

  if (responseStatsAt != null && responseStatsAt !== '') {
    const stamped =
      responseStatsAt instanceof Date
        ? responseStatsAt.getTime()
        : new Date(responseStatsAt).getTime();
    if (!Number.isFinite(stamped)) return null;
    const nowMs = now instanceof Date ? now.getTime() : now;
    if (!Number.isFinite(nowMs) || nowMs - stamped > RESPONSE_STATS_STALE_MS) {
      return null;
    }
  }

  if (avgResponseMs <= HOUR_MS) return RESPONSE_BUCKET_WITHIN_HOUR;
  if (avgResponseMs <= DAY_MS) return RESPONSE_BUCKET_WITHIN_DAY;
  if (avgResponseMs <= 2 * DAY_MS) return RESPONSE_BUCKET_WITHIN_2_DAYS;
  return null;
}
