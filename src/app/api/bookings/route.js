import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  getSupabaseAsService,
} from '@/lib/supabaseServer';
import { createBookingRequest } from '@/lib/bookingService';
import { normalizeSingleLine } from '@/lib/textNormalize';
import {
  STUDENT_PROFILE_SELECT,
  GUEST_PROFILE_SELECT,
  missingProfileFields,
  isProfileComplete,
  toGuestProfile,
} from '@/lib/studentProfileFields';

/**
 * POST /api/bookings — student creates a booking request.
 * GET  /api/bookings — list own bookings (student) or listing bookings (landlord).
 */

async function resolveActor(request) {
  const token = extractToken(request);
  if (!token) return { status: 401 };
  const user = await getUserFromToken(token);
  if (!user) return { status: 401 };
  const supabase = getSupabaseWithToken(token);

  const { data: student } = await supabase
    .from('students')
    .select(STUDENT_PROFILE_SELECT)
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (student) {
    return { user, supabase, token, role: 'student', student };
  }

  const { data: landlord } = await supabase
    .from('landlords')
    .select('landlord_id, name, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (landlord) {
    return { user, supabase, token, role: 'landlord', landlord };
  }

  return { status: 403, error: 'NO_PROFILE' };
}

function mapLandlordBookings(rows) {
  return (rows || []).map((row) => {
    const studentsRaw = row.students;
    const student = Array.isArray(studentsRaw) ? studentsRaw[0] : studentsRaw;
    const { students: _drop, ...rest } = row;
    return {
      ...rest,
      students: toGuestProfile(student),
    };
  });
}

export async function POST(request) {
  const auth = await resolveActor(request);
  if (auth.status) {
    return NextResponse.json(
      { error_code: auth.error || 'NOT_AUTHENTICATED', error: 'Sign in as a student to book' },
      { status: auth.status },
    );
  }
  if (auth.role !== 'student') {
    return NextResponse.json(
      { error_code: 'WRONG_ROLE', error: 'Only students can request bookings' },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  // Profile must be complete before a booking request is accepted.
  // Optional fields on the account page; hard gate only at request-to-book.
  if (!isProfileComplete(auth.student)) {
    const missing = missingProfileFields(auth.student);
    return NextResponse.json(
      {
        error_code: 'PROFILE_INCOMPLETE',
        error: 'Complete your guest profile before requesting a booking',
        missing_fields: missing,
      },
      { status: 400 },
    );
  }

  const listingId = normalizeSingleLine(body.listing_id) ?? '';
  if (!listingId || listingId.length > 64) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'listing_id is required' },
      { status: 400 },
    );
  }

  const result = await createBookingRequest({
    student: auth.student,
    user: auth.user,
    supabase: auth.supabase,
    listingId,
    moveIn: body.move_in,
    moveOut: body.move_out,
    message: body.message,
  });

  if (result.error) {
    return NextResponse.json(
      { error_code: result.error, error: result.message },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json(
    {
      booking: result.booking,
      inquiry_id: result.inquiry_id,
      cost: result.cost,
    },
    { status: 201 },
  );
}

export async function GET(request) {
  const auth = await resolveActor(request);
  if (auth.status) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state'); // optional filter or comma list

  if (auth.role === 'student') {
    let query = auth.supabase
      .from('bookings')
      .select(`
        *,
        listings (
          listing_id,
          title,
          photos,
          location ( address, neighborhood ),
          rent ( monthly_price, deposit ),
          agency_fee
        )
      `)
      .eq('student_id', auth.student.student_id)
      .order('created_at', { ascending: false });
    if (state) {
      const states = state.split(',').map((s) => s.trim()).filter(Boolean);
      if (states.length === 1) query = query.eq('state', states[0]);
      else if (states.length > 1) query = query.in('state', states);
    }
    const { data, error } = await query;
    if (error) {
      console.error('GET /api/bookings student:', error);
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
    }
    return NextResponse.json({ bookings: data || [], role: 'student' });
  }

  // Landlord: bookings on own listings only. Guest profile has no email.
  const service = getSupabaseAsService();
  const { data: listingRows } = await service
    .from('listings')
    .select('listing_id')
    .eq('landlord_id', auth.landlord.landlord_id);
  const listingIds = (listingRows || []).map((r) => r.listing_id);
  if (listingIds.length === 0) {
    return NextResponse.json({ bookings: [], counts: emptyCounts(), role: 'landlord' });
  }

  let query = service
    .from('bookings')
    .select(`
      *,
      students ( ${GUEST_PROFILE_SELECT} ),
      listings ( listing_id, title, location ( address, neighborhood ) )
    `)
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false });

  if (state) {
    const states = state.split(',').map((s) => s.trim()).filter(Boolean);
    if (states.length === 1) query = query.eq('state', states[0]);
    else if (states.length > 1) query = query.in('state', states);
  }

  const { data, error } = await query;
  if (error) {
    console.error('GET /api/bookings landlord:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }

  const bookings = mapLandlordBookings(data);
  // Counts across all states for filter tabs (always full, not filtered).
  const { data: allForCounts } = await service
    .from('bookings')
    .select('state')
    .in('listing_id', listingIds);
  const counts = emptyCounts();
  for (const row of allForCounts || []) {
    if (counts[row.state] != null) counts[row.state] += 1;
  }

  return NextResponse.json({ bookings, counts, role: 'landlord' });
}

function emptyCounts() {
  return {
    requested: 0,
    accepted: 0,
    confirmed: 0,
    declined: 0,
    cancelled: 0,
    expired: 0,
  };
}
