import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  getSupabaseAsService,
} from '@/lib/supabaseServer';
import {
  applyTransition,
  confirmMoveIn,
  reportMoveInProblem,
  inquiryIdForBooking,
  hasMoveInResponse,
} from '@/lib/bookingService';
import { canRespondToMoveIn, canStudentCancel } from '@/lib/bookingState';

async function resolveAuth(request) {
  const token = extractToken(request);
  if (!token) return { status: 401 };
  const user = await getUserFromToken(token);
  if (!user) return { status: 401 };
  const supabase = getSupabaseWithToken(token);

  const { data: student } = await supabase
    .from('students')
    .select('student_id, email, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (student) return { user, supabase, role: 'student', student };

  const { data: landlord } = await supabase
    .from('landlords')
    .select('landlord_id, name, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (landlord) return { user, supabase, role: 'landlord', landlord };

  return { status: 403 };
}

async function loadBookingForViewer(bookingId, auth) {
  const service = getSupabaseAsService();
  const { data: booking, error } = await service
    .from('bookings')
    .select(`
      *,
      students ( student_id, display_name, email ),
      listings (
        listing_id,
        title,
        photos,
        landlord_id,
        location ( address, neighborhood ),
        rent ( monthly_price, deposit ),
        agency_fee
      )
    `)
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error || !booking) return { status: 404 };

  if (auth.role === 'student') {
    if (booking.student_id !== auth.student.student_id) return { status: 404 };
    return { booking };
  }

  if (auth.role === 'landlord') {
    if (booking.listings?.landlord_id !== auth.landlord.landlord_id) {
      return { status: 404 };
    }
    return { booking };
  }

  return { status: 403 };
}

function plainBookingRow(booking) {
  return {
    booking_id: booking.booking_id,
    student_id: booking.student_id,
    listing_id: booking.listing_id,
    move_in: booking.move_in,
    move_out: booking.move_out,
    monthly_rent: booking.monthly_rent,
    total_stay_value: booking.total_stay_value,
    state: booking.state,
    last_activity_at: booking.last_activity_at,
  };
}

/**
 * GET /api/bookings/[id]
 */
export async function GET(request, { params }) {
  const auth = await resolveAuth(request);
  if (auth.status) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
  }

  const { id } = await params;
  const loaded = await loadBookingForViewer(id, auth);
  if (loaded.status) {
    return NextResponse.json({ error: 'Not found' }, { status: loaded.status });
  }

  const service = getSupabaseAsService();
  const { data: events } = await service
    .from('booking_events')
    .select('event_id, from_state, to_state, actor, metadata, created_at')
    .eq('booking_id', id)
    .order('created_at', { ascending: true });

  const inquiryId = await inquiryIdForBooking(id);
  const moveInAnswered = await hasMoveInResponse(id);
  const row = plainBookingRow(loaded.booking);

  return NextResponse.json({
    booking: loaded.booking,
    events: events || [],
    role: auth.role,
    inquiry_id: inquiryId,
    move_in: {
      can_respond: canRespondToMoveIn(row) && !moveInAnswered,
      answered: moveInAnswered,
    },
    can_cancel:
      (auth.role === 'student' && canStudentCancel(row)) ||
      (auth.role === 'landlord' &&
        (row.state === 'requested' ||
          row.state === 'accepted' ||
          row.state === 'confirmed')),
  });
}

/**
 * PATCH /api/bookings/[id]
 * body: { action: 'accept' | 'decline' | 'cancel' | 'confirm-move-in' | 'report-problem', description? }
 */
export async function PATCH(request, { params }) {
  const auth = await resolveAuth(request);
  if (auth.status) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
  }

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body?.action;
  if (
    !['accept', 'decline', 'cancel', 'confirm-move-in', 'report-problem'].includes(
      action,
    )
  ) {
    return NextResponse.json(
      {
        error:
          'action must be accept, decline, cancel, confirm-move-in, or report-problem',
      },
      { status: 400 },
    );
  }

  const loaded = await loadBookingForViewer(id, auth);
  if (loaded.status) {
    return NextResponse.json({ error: 'Not found' }, { status: loaded.status });
  }
  const booking = loaded.booking;
  const row = plainBookingRow(booking);

  if (action === 'accept') {
    if (auth.role !== 'landlord') {
      return NextResponse.json({ error: 'Only the landlord can accept' }, { status: 403 });
    }
    const { acceptBooking } = await import('@/lib/bookingService');
    const result = await acceptBooking({ booking: row, actor: 'landlord' });
    if (result.error) {
      return NextResponse.json(
        { error_code: result.error, error: result.message || result.error },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json({ booking: result.booking });
  }

  if (action === 'decline') {
    if (auth.role !== 'landlord') {
      return NextResponse.json({ error: 'Only the landlord can decline' }, { status: 403 });
    }
    const { declineBooking } = await import('@/lib/bookingService');
    const result = await declineBooking({ booking: row, actor: 'landlord' });
    if (result.error) {
      return NextResponse.json(
        { error_code: result.error, error: result.message || result.error },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json({ booking: result.booking });
  }

  if (action === 'confirm-move-in') {
    if (auth.role !== 'student') {
      return NextResponse.json(
        { error: 'Only the student can confirm move-in' },
        { status: 403 },
      );
    }
    const result = await confirmMoveIn({ booking: row, actor: 'student' });
    if (result.error) {
      return NextResponse.json(
        { error_code: result.error, error: result.message || result.error },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json({ booking: result.booking });
  }

  if (action === 'report-problem') {
    if (auth.role !== 'student') {
      return NextResponse.json(
        { error: 'Only the student can report a problem' },
        { status: 403 },
      );
    }
    const result = await reportMoveInProblem({
      booking: row,
      actor: 'student',
      description: body?.description,
    });
    if (result.error) {
      return NextResponse.json(
        { error_code: result.error, error: result.message || result.error },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json({ booking: result.booking });
  }

  // cancel — student or landlord
  if (auth.role !== 'student' && auth.role !== 'landlord') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const result = await applyTransition({
    booking: row,
    toState: 'cancelled',
    actor: auth.role,
  });
  if (result.error) {
    return NextResponse.json(
      { error_code: result.error, error: result.message || result.error },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json({ booking: result.booking });
}
