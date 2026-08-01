/**
 * One landlord reminder per requested booking after 24h of inactivity.
 * Marks sent via a booking_events row (metadata.kind = 'reminder_24h')
 * so the job is idempotent.
 *
 * Cadence: 5m (master tick registry).
 */

import { getSupabaseAsService } from '@/lib/supabaseServer';
import { isDueReminder, REMINDER_MS, EXPIRY_MS } from '@/lib/bookingState';
import { sendBookingReminderEmail } from '@/lib/bookingEmail';

export async function runBookingReminder(now = new Date()) {
  const service = getSupabaseAsService();
  const reminderCutoff = new Date(now.getTime() - REMINDER_MS).toISOString();
  const expiryCutoff = new Date(now.getTime() - EXPIRY_MS).toISOString();

  // Idle ≥ 24h and still inside the 2-day window (expiry job owns the rest).
  const { data: candidates, error } = await service
    .from('bookings')
    .select(`
      booking_id,
      listing_id,
      move_in,
      move_out,
      state,
      last_activity_at,
      student_id,
      students ( display_name )
    `)
    .eq('state', 'requested')
    .lte('last_activity_at', reminderCutoff)
    .gt('last_activity_at', expiryCutoff)
    .limit(100);

  if (error) {
    console.error('[booking-reminder] query failed:', error);
    return { ok: false, error: error.message, reminded: 0 };
  }

  let reminded = 0;
  const failures = [];

  for (const booking of candidates || []) {
    if (!isDueReminder(booking, now)) continue;

    // Already reminded?
    const { data: prior } = await service
      .from('booking_events')
      .select('event_id')
      .eq('booking_id', booking.booking_id)
      .contains('metadata', { kind: 'reminder_24h' })
      .limit(1)
      .maybeSingle();
    if (prior) continue;

    const student = Array.isArray(booking.students)
      ? booking.students[0]
      : booking.students;

    try {
      await sendBookingReminderEmail({
        bookingId: booking.booking_id,
        listingId: booking.listing_id,
        studentName: student?.display_name,
        moveIn: booking.move_in,
        moveOut: booking.move_out,
      });

      await service.from('booking_events').insert({
        booking_id: booking.booking_id,
        from_state: 'requested',
        to_state: 'requested',
        actor: 'system',
        metadata: { kind: 'reminder_24h', at: now.toISOString() },
      });
      reminded += 1;
    } catch (err) {
      failures.push({ booking_id: booking.booking_id, error: err?.message || String(err) });
      console.error(
        `[booking-reminder] failed booking=${booking.booking_id}:`,
        err,
      );
    }
  }

  return {
    ok: failures.length === 0,
    reminded,
    scanned: (candidates || []).length,
    failures,
  };
}
