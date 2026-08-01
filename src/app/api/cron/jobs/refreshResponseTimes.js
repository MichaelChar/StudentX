/**
 * Recompute landlords.avg_response_ms for every landlord and stamp
 * response_stats_at. Cadence: daily@03:05 on the master tick (no new CF
 * trigger). Public /api/listings ranks on the denormalised column so this
 * job is the only path that runs the per-landlord inquiries scan.
 */

import { getSupabaseAsService } from '@/lib/supabaseServer';
import { getLandlordResponseTime } from '@/lib/landlordResponseTime';

/**
 * @returns {Promise<{ ok: boolean, updated: number, scanned: number, failures?: Array<object>, error?: string }>}
 */
export async function runRefreshResponseTimes(now = new Date()) {
  let service;
  try {
    service = getSupabaseAsService();
  } catch (err) {
    console.error('[refresh-response-times] service client unavailable:', err?.message || err);
    return { ok: false, error: err?.message || String(err), updated: 0, scanned: 0 };
  }

  const { data: landlords, error: llErr } = await service
    .from('landlords')
    .select('landlord_id');

  if (llErr) {
    console.error('[refresh-response-times] landlords query failed:', llErr);
    return { ok: false, error: llErr.message, updated: 0, scanned: 0 };
  }

  const rows = landlords || [];
  let updated = 0;
  const failures = [];
  const stampedAt = now.toISOString();

  for (const { landlord_id: landlordId } of rows) {
    if (!landlordId) continue;
    try {
      const { data: listings, error: listErr } = await service
        .from('listings')
        .select('listing_id')
        .eq('landlord_id', landlordId);

      if (listErr) throw listErr;

      const listingIds = (listings || []).map((l) => l.listing_id).filter(Boolean);
      const stats = await getLandlordResponseTime(service, listingIds);
      const avgMs =
        stats.avgMs != null && Number.isFinite(stats.avgMs)
          ? Math.round(stats.avgMs)
          : null;

      const { error: updErr } = await service
        .from('landlords')
        .update({
          avg_response_ms: avgMs,
          response_stats_at: stampedAt,
        })
        .eq('landlord_id', landlordId);

      if (updErr) throw updErr;
      updated += 1;
    } catch (err) {
      const message = err?.message || String(err);
      failures.push({ landlord_id: landlordId, error: message });
      console.error(
        `[refresh-response-times] failed landlord=${landlordId} error=${message}`,
      );
    }
  }

  return {
    ok: failures.length === 0,
    updated,
    scanned: rows.length,
    ...(failures.length ? { failures } : {}),
  };
}
