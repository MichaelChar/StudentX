import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
} from '@/lib/supabaseServer';
import { sendLandlordInquiryEmail } from '@/lib/inquiryEmail';
import { normalizeMultiLine, normalizeSingleLine } from '@/lib/textNormalize';

const MAX_MESSAGE_LEN = 4000;
const MAX_LISTING_ID_LEN = 64;

const ERROR_MAP = {
  P0001: { code: 'CAP_EXCEEDED', status: 403 },
  P0002: { code: 'LISTING_NOT_FOUND', status: 404 },
  P0004: { code: 'NOT_AUTHENTICATED', status: 401 },
  P0005: { code: 'STUDENT_PROFILE_MISSING', status: 403 },
  P0006: { code: 'INVALID_INPUT', status: 400 },
};

/**
 * Authenticated counterpart to the (deleted) anonymous /api/inquiries
 * route. The student is identified by their JWT — name/email are
 * pulled from the students table inside the RPC, so the client only
 * needs to supply the listing_id and the first message body.
 *
 * For an existing thread, returns is_new=false and the same inquiry_id
 * so the UI can route directly into the chat without creating duplicates.
 */
export async function POST(request) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json(
      { error_code: 'NOT_AUTHENTICATED', error: 'Sign in to send an inquiry' },
      { status: 401 }
    );
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json(
      { error_code: 'NOT_AUTHENTICATED', error: 'Sign in to send an inquiry' },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const listingId = normalizeSingleLine(body.listing_id) ?? '';
  const message = normalizeMultiLine(body.message) ?? '';

  if (!listingId || listingId.length > MAX_LISTING_ID_LEN) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'listing_id is required' },
      { status: 400 }
    );
  }
  if (message.length < 10) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'message must be at least 10 characters' },
      { status: 400 }
    );
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: `message must be at most ${MAX_MESSAGE_LEN} characters` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseWithToken(token);
  const { data, error } = await supabase.rpc('start_inquiry_authenticated', {
    p_listing_id: listingId,
    p_message: message,
  });

  if (error) {
    const mapped = ERROR_MAP[error.code];
    if (mapped) {
      return NextResponse.json(
        { error_code: mapped.code, error: error.message },
        { status: mapped.status }
      );
    }
    console.error('start_inquiry_authenticated RPC error:', error);
    return NextResponse.json(
      { error_code: 'INTERNAL', error: 'Failed to start inquiry' },
      { status: 500 }
    );
  }

  // RPC returns a SETOF row; postgrest hands us an array. We RETURN NEXT
  // exactly once, so [0] is always the row.
  const row = Array.isArray(data) ? data[0] : data;
  const inquiryId = row?.inquiry_id;
  const isNew = Boolean(row?.is_new);

  if (!inquiryId) {
    return NextResponse.json(
      { error_code: 'INTERNAL', error: 'Inquiry creation returned no id' },
      { status: 500 }
    );
  }

  if (isNew) {
    // First message: seed the chat thread + email the landlord. Both run
    // best-effort — if either fails the inquiry already exists and the
    // user can resend through the chat UI.
    const { error: messageError } = await supabase.from('inquiry_messages').insert({
      inquiry_id: inquiryId,
      sender_user_id: user.id,
      sender_role: 'student',
      body: message,
    });
    if (messageError) {
      console.error('Failed to insert first chat message:', messageError);
    }

    // Pull the student's display_name/email for the email template via
    // the same authed client so RLS keeps the read constrained.
    const { data: student } = await supabase
      .from('students')
      .select('display_name, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (student) {
      await sendLandlordInquiryEmail({
        inquiryId,
        listingId,
        studentName: student.display_name,
        studentEmail: student.email,
        message,
        request,
      });
    }
  }

  return NextResponse.json({ inquiry_id: inquiryId, is_new: isNew }, { status: 201 });
}
