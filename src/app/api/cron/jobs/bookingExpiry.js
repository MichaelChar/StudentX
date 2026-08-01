/**
 * Expire requested bookings whose last_activity_at is ≥ 2 days old.
 * Releases the pending availability block on every terminal path.
 *
 * Cadence: 5m (registered on the master tick — no new CF trigger).
 */

import { getSupabaseAsService } from '@/lib/supabaseServer';
import { isExpiredByInactivity, EXPIRY_MS } from '@/lib/bookingState';
import { applyTransition } from '@/lib/bookingService';

export async function runBookingExpiry(now = new Date()) {
  const service = getSupabaseAsService();
  const cutoff = new Date(now.getTime() - EXPIRY_MS).toISOString();

  const { data: candidates, error } = await service
    .from('bookings')
    .select('*')
    .eq('state', 'requested')
    .lte('last_activity_at', cutoff)
    .limit(100);

  if (error) {
    console.error('[booking-expiry] query failed:', error);
    return { ok: false, error: error.message, expired: 0 };
  }

  let expired = 0;
  const failures = [];

  for (const booking of candidates || []) {
    if (!isExpiredByInactivity(booking, now)) continue;
    const result = await applyTransition({
      booking,
      toState: 'expired',
      actor: 'system',
      now,
      metadata: { kind: 'inactivity_expiry', idle_ms: EXPIRY_MS },
    });
    if (result.error) {
      failures.push({ booking_id: booking.booking_id, error: result.error });
      console.error(
        `[booking-expiry] failed booking=${booking.booking_id} error=${result.error}`,
      );
    } else {
      expired += 1;
    }
  }

  return {
    ok: failures.length === 0,
    expired,
    scanned: (candidates || []).length,
    failures,
  };
}
