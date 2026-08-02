/**
 * Orchestrates booking create + transitions against Supabase.
 * Keeps route handlers thin.
 */

import { getSupabaseAsService } from '@/lib/supabaseServer';
import {
  parseStayRange,
  listingCoversStay,
  durationFitsListing,
  costSummary,
  stayDurationMonthsExact,
} from '@/lib/bookingDates';
import {
  planTransition,
  planOfflineAccept,
  hasBlockingOverlap,
  blockActionForTransition,
} from '@/lib/bookingState';
import { executeBlockAction } from '@/lib/bookingBlocks';
import {
  sendBookingRequestEmail,
  sendBookingAcceptedEmail,
  sendBookingDeclinedEmail,
} from '@/lib/bookingEmail';
import { normalizeMultiLine } from '@/lib/textNormalize';

const MAX_MESSAGE_LEN = 4000;

/**
 * Load listing + rent for booking validation (service role — public data).
 */
export async function loadListingForBooking(listingId) {
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('listings')
    .select(`
      listing_id,
      listing_status,
      available_from,
      available_to,
      min_duration_months,
      max_duration_months,
      agency_fee,
      rent ( monthly_price, currency, deposit, bills_included )
    `)
    .eq('listing_id', listingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rent = Array.isArray(data.rent) ? data.rent[0] : data.rent;
  return {
    listing_id: data.listing_id,
    listing_status: data.listing_status ?? 'active',
    available_from: data.available_from,
    available_to: data.available_to,
    min_duration_months: data.min_duration_months,
    max_duration_months: data.max_duration_months,
    agency_fee: data.agency_fee,
    monthly_price: rent?.monthly_price ?? null,
    deposit: rent?.deposit ?? 0,
    currency: rent?.currency ?? 'EUR',
  };
}

async function loadBlocksForListing(listingId) {
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('listing_availability_blocks')
    .select('block_id, listing_id, start_date, end_date, kind')
    .eq('listing_id', listingId)
    .in('kind', ['pending', 'booked']);
  if (error) throw error;
  return data || [];
}

/**
 * Create a booking request: row + pending block + event + inquiry + email.
 */
export async function createBookingRequest({
  student,
  user,
  supabase, // token-scoped student client
  listingId,
  moveIn: moveInRaw,
  moveOut: moveOutRaw,
  message: messageRaw,
}) {
  const range = parseStayRange(moveInRaw, moveOutRaw);
  if (range.error) return { error: 'INVALID_INPUT', message: range.error, status: 400 };

  const message = normalizeMultiLine(messageRaw) ?? '';
  if (message.length < 10) {
    return {
      error: 'INVALID_INPUT',
      message: 'message must be at least 10 characters',
      status: 400,
    };
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return {
      error: 'INVALID_INPUT',
      message: `message must be at most ${MAX_MESSAGE_LEN} characters`,
      status: 400,
    };
  }

  const listing = await loadListingForBooking(listingId);
  if (!listing) {
    return { error: 'LISTING_NOT_FOUND', message: 'Listing not found', status: 404 };
  }
  if (listing.listing_status === 'disabled') {
    return {
      error: 'LISTING_DISABLED',
      message: 'This listing is not available for booking',
      status: 404,
    };
  }
  if (listing.monthly_price == null || Number(listing.monthly_price) <= 0) {
    return {
      error: 'LISTING_NOT_BOOKABLE',
      message: 'Listing has no monthly rent',
      status: 400,
    };
  }

  const { moveIn, moveOut, months } = range;
  if (!listingCoversStay(listing, moveIn, moveOut)) {
    return {
      error: 'DATES_UNAVAILABLE',
      message: 'Listing is not available for those dates',
      status: 409,
    };
  }
  if (!durationFitsListing(listing, months)) {
    return {
      error: 'DURATION_INVALID',
      message: 'Stay length does not fit the listing min/max duration',
      status: 400,
    };
  }

  const blocks = await loadBlocksForListing(listingId);
  if (hasBlockingOverlap(blocks, listingId, moveIn, moveOut)) {
    return {
      error: 'DATES_UNAVAILABLE',
      message: 'Those dates overlap an existing hold or booking',
      status: 409,
    };
  }

  const monthlyRent = Number(listing.monthly_price);
  const summary = costSummary({
    monthlyRent,
    months,
    monthsExact: stayDurationMonthsExact(moveIn, moveOut),
    deposit: listing.deposit,
    agencyFee: listing.agency_fee,
  });
  const totalStayValue = summary.total_rent;

  // Insert booking as the student (RLS: own row, state requested).
  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      student_id: student.student_id,
      listing_id: listingId,
      move_in: moveIn,
      move_out: moveOut,
      monthly_rent: monthlyRent,
      total_stay_value: totalStayValue,
      state: 'requested',
    })
    .select('*')
    .single();

  if (insertErr) {
    console.error('createBookingRequest insert:', insertErr);
    return { error: 'INTERNAL', message: 'Failed to create booking', status: 500 };
  }

  // Pending block (service role) + audit event.
  try {
    await executeBlockAction(
      blockActionForTransition(null, 'requested'),
      { listing_id: listingId, move_in: moveIn, move_out: moveOut },
    );
  } catch (err) {
    console.error('createBookingRequest block:', err);
    // Best-effort rollback of the booking row so we don't leave a ghost request.
    await getSupabaseAsService().from('bookings').delete().eq('booking_id', booking.booking_id);
    return { error: 'INTERNAL', message: 'Failed to hold dates', status: 500 };
  }

  const service = getSupabaseAsService();
  await service.from('booking_events').insert({
    booking_id: booking.booking_id,
    from_state: null,
    to_state: 'requested',
    actor: 'student',
    metadata: { months, message_preview: message.slice(0, 200) },
  });

  // Inquiry thread via existing RPC; link inquiry_id in a follow-up event.
  let inquiryId = null;
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'start_inquiry_authenticated',
      { p_listing_id: listingId, p_message: message },
    );
    if (rpcErr) {
      console.error('createBookingRequest inquiry RPC:', rpcErr);
    } else {
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      inquiryId = row?.inquiry_id ?? null;
      const isNew = Boolean(row?.is_new);
      if (inquiryId && isNew) {
        await supabase.from('inquiry_messages').insert({
          inquiry_id: inquiryId,
          sender_user_id: user.id,
          sender_role: 'student',
          body: message,
        });
      }
      if (inquiryId) {
        // Real FK link (migration 101). Keep the audit event as the
        // transition log, but do not use metadata as the foreign key.
        const { error: linkErr } = await service
          .from('inquiries')
          .update({ booking_id: booking.booking_id })
          .eq('inquiry_id', inquiryId);
        if (linkErr) {
          console.error('createBookingRequest inquiry link:', linkErr);
        }
        await service.from('booking_events').insert({
          booking_id: booking.booking_id,
          from_state: 'requested',
          to_state: 'requested',
          actor: 'system',
          metadata: { kind: 'inquiry_linked', inquiry_id: inquiryId },
        });
      }
    }
  } catch (err) {
    console.error('createBookingRequest inquiry:', err);
  }

  await sendBookingRequestEmail({
    bookingId: booking.booking_id,
    listingId,
    studentName: student.display_name,
    studentEmail: student.email,
    message,
    moveIn,
    moveOut,
    monthlyRent,
  });

  return {
    booking,
    inquiry_id: inquiryId,
    cost: summary,
  };
}

/**
 * Apply a single transition (decline / cancel / expire) with block release.
 */
export async function applyTransition({
  booking,
  toState,
  actor,
  metadata = {},
  now = new Date(),
}) {
  const plan = planTransition({ booking, toState, actor, now, metadata });
  if (plan.error) {
    return { error: plan.error, status: plan.error === 'ILLEGAL_TRANSITION' ? 409 : 400 };
  }

  const service = getSupabaseAsService();
  const stay = {
    listing_id: booking.listing_id,
    move_in: booking.move_in,
    move_out: booking.move_out,
  };

  // Release / convert block first so a failed hold never strands a state.
  try {
    await executeBlockAction(plan.blockAction, stay);
  } catch (err) {
    console.error('applyTransition block:', err);
    return { error: 'INTERNAL', message: 'Failed to update availability', status: 500 };
  }

  const { data: updated, error: updErr } = await service
    .from('bookings')
    .update(plan.patch)
    .eq('booking_id', booking.booking_id)
    .eq('state', booking.state) // optimistic concurrency
    .select('*')
    .maybeSingle();

  if (updErr) {
    console.error('applyTransition update:', updErr);
    return { error: 'INTERNAL', message: 'Failed to update booking', status: 500 };
  }
  if (!updated) {
    return { error: 'CONFLICT', message: 'Booking state changed', status: 409 };
  }

  await service.from('booking_events').insert(plan.event);

  return { booking: updated, event: plan.event, blockAction: plan.blockAction };
}

/**
 * Landlord offline accept: requested → accepted → confirmed + pending→booked.
 */
export async function acceptBookingOffline({ booking, actor = 'landlord', now = new Date() }) {
  const plan = planOfflineAccept({ booking, actor, now });
  if (plan.error) {
    return { error: plan.error, status: plan.error === 'ILLEGAL_TRANSITION' ? 409 : 400 };
  }

  const service = getSupabaseAsService();
  const stay = {
    listing_id: booking.listing_id,
    move_in: booking.move_in,
    move_out: booking.move_out,
  };

  // First step's block action (pending → booked).
  const firstStep = plan.steps[0];
  try {
    await executeBlockAction(firstStep.blockAction, stay);
  } catch (err) {
    console.error('acceptBookingOffline block:', err);
    return { error: 'INTERNAL', message: 'Failed to update availability', status: 500 };
  }

  const finalPatch = plan.steps[plan.steps.length - 1].patch;
  const { data: updated, error: updErr } = await service
    .from('bookings')
    .update(finalPatch)
    .eq('booking_id', booking.booking_id)
    .eq('state', booking.state)
    .select('*')
    .maybeSingle();

  if (updErr) {
    console.error('acceptBookingOffline update:', updErr);
    return { error: 'INTERNAL', message: 'Failed to update booking', status: 500 };
  }
  if (!updated) {
    return { error: 'CONFLICT', message: 'Booking state changed', status: 409 };
  }

  // Both audit events (accepted then confirmed).
  await service.from('booking_events').insert(plan.steps.map((s) => s.event));

  return { booking: updated, steps: plan.steps };
}

/**
 * Touch last_activity_at (message activity). Resets the rolling expiry clock.
 */
export async function touchBookingActivity(bookingId, now = new Date()) {
  if (!bookingId) return;
  const service = getSupabaseAsService();
  await service
    .from('bookings')
    .update({ last_activity_at: now.toISOString() })
    .eq('booking_id', bookingId)
    .eq('state', 'requested');
}

/**
 * Resolve booking_id linked to an inquiry via inquiries.booking_id (101).
 */
export async function bookingIdForInquiry(inquiryId) {
  if (!inquiryId) return null;
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('inquiries')
    .select('booking_id')
    .eq('inquiry_id', inquiryId)
    .maybeSingle();
  if (error || !data) return null;
  return data.booking_id ?? null;
}

export async function loadBooking(bookingId) {
  const service = getSupabaseAsService();
  const { data, error } = await service
    .from('bookings')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Decline helper with student email.
 */
export async function declineBooking({ booking, actor = 'landlord' }) {
  const result = await applyTransition({
    booking,
    toState: 'declined',
    actor,
  });
  if (result.error) return result;

  // Student contact for email.
  const service = getSupabaseAsService();
  const { data: student } = await service
    .from('students')
    .select('email, display_name')
    .eq('student_id', booking.student_id)
    .maybeSingle();

  await sendBookingDeclinedEmail({
    bookingId: booking.booking_id,
    listingId: booking.listing_id,
    studentEmail: student?.email,
    studentName: student?.display_name,
    moveIn: booking.move_in,
    moveOut: booking.move_out,
  });

  return result;
}

export async function acceptBooking({ booking, actor = 'landlord' }) {
  const result = await acceptBookingOffline({ booking, actor });
  if (result.error) return result;

  const service = getSupabaseAsService();
  const { data: student } = await service
    .from('students')
    .select('email, display_name')
    .eq('student_id', booking.student_id)
    .maybeSingle();

  await sendBookingAcceptedEmail({
    bookingId: booking.booking_id,
    listingId: booking.listing_id,
    studentEmail: student?.email,
    studentName: student?.display_name,
    moveIn: booking.move_in,
    moveOut: booking.move_out,
  });

  return result;
}
