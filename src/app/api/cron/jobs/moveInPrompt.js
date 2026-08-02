/**
 * Email students on confirmed bookings whose move-in day has arrived and who
 * have not yet answered the move-in prompt (confirm or report a problem).
 *
 * Candidates are state = 'confirmed' only — moved_in / disputed are excluded
 * by the state filter (no booking_events metadata scan for move_in_ok).
 * Idempotent via booking_events metadata.kind = move_in_prompt (one email
 * per booking). Silence is NOT confirmation.
 *
 * Cadence: daily (registered on the master tick — no new CF trigger).
 */

import { getSupabaseAsService } from '@/lib/supabaseServer';
import {
  isEligibleForMoveInPrompt,
  MOVE_IN_PROMPT_KIND,
  utcDateString,
} from '@/lib/bookingState';
import { sendMoveInPromptEmail } from '@/lib/bookingEmail';

export async function runMoveInPrompt(now = new Date()) {
  const service = getSupabaseAsService();
  const today = utcDateString(now);

  const { data: candidates, error } = await service
    .from('bookings')
    .select(`
      booking_id,
      listing_id,
      move_in,
      move_out,
      state,
      student_id,
      students ( display_name, email )
    `)
    .eq('state', 'confirmed')
    .lte('move_in', today)
    .limit(100);

  if (error) {
    console.error('[move-in-prompt] query failed:', error);
    return { ok: false, error: error.message, prompted: 0 };
  }

  let prompted = 0;
  const failures = [];

  for (const booking of candidates || []) {
    if (!isEligibleForMoveInPrompt(booking, now)) continue;

    // Already emailed?
    const { data: prior } = await service
      .from('booking_events')
      .select('event_id')
      .eq('booking_id', booking.booking_id)
      .contains('metadata', { kind: MOVE_IN_PROMPT_KIND })
      .limit(1)
      .maybeSingle();
    if (prior) continue;

    const student = Array.isArray(booking.students)
      ? booking.students[0]
      : booking.students;

    try {
      await sendMoveInPromptEmail({
        bookingId: booking.booking_id,
        listingId: booking.listing_id,
        studentEmail: student?.email,
        studentName: student?.display_name,
        moveIn: booking.move_in,
        moveOut: booking.move_out,
      });

      await service.from('booking_events').insert({
        booking_id: booking.booking_id,
        from_state: 'confirmed',
        to_state: 'confirmed',
        actor: 'system',
        metadata: { kind: MOVE_IN_PROMPT_KIND, at: now.toISOString() },
      });
      prompted += 1;
    } catch (err) {
      failures.push({
        booking_id: booking.booking_id,
        error: err?.message || String(err),
      });
      console.error(
        `[move-in-prompt] failed booking=${booking.booking_id}:`,
        err,
      );
    }
  }

  return {
    ok: failures.length === 0,
    prompted,
    scanned: (candidates || []).length,
    failures,
  };
}
