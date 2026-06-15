import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
} from '@/lib/supabaseServer';
import { sendGigInquiryEmail } from '@/lib/gigInquiryEmail';
import { normalizeMultiLine, normalizeSingleLine } from '@/lib/textNormalize';

const MAX_MESSAGE_LEN = 4000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/gigs/inquiries — a signed-in student expresses interest in a gig.
 *
 * Reuses the property inquiry pattern (auth via JWT, identity pulled from the
 * students table) but writes to the standalone gig_inquiries table and emails
 * the gigs alert inbox — there are no employer accounts to thread a chat with
 * yet (see migration 061 + src/lib/gigInquiryEmail.js).
 */
export async function POST(request) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json(
      { error_code: 'NOT_AUTHENTICATED', error: 'Sign in to express interest' },
      { status: 401 }
    );
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json(
      { error_code: 'NOT_AUTHENTICATED', error: 'Sign in to express interest' },
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

  const gigId = normalizeSingleLine(body.gig_id) ?? '';
  const message = normalizeMultiLine(body.message) ?? '';

  if (!UUID_RE.test(gigId)) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'gig_id is required' },
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

  // Identity comes from the student profile, never the client payload.
  const { data: student } = await supabase
    .from('students')
    .select('display_name, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const studentEmail = student?.email || user.email;
  const studentName = student?.display_name || null;
  if (!studentEmail) {
    return NextResponse.json(
      { error_code: 'STUDENT_PROFILE_MISSING', error: 'No email on file for your account' },
      { status: 403 }
    );
  }

  // Guard against inserting interest for a gig that isn't live.
  const { data: gig, error: gigError } = await supabase
    .from('gigs')
    .select('gig_id')
    .eq('gig_id', gigId)
    .eq('is_active', true)
    .maybeSingle();

  if (gigError || !gig) {
    return NextResponse.json(
      { error_code: 'GIG_NOT_FOUND', error: 'Gig not found' },
      { status: 404 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('gig_inquiries')
    .insert({
      gig_id: gigId,
      student_user_id: user.id,
      student_name: studentName,
      student_email: studentEmail,
      message,
    })
    .select('inquiry_id')
    .single();

  if (insertError) {
    console.error('gig_inquiries insert error:', insertError);
    return NextResponse.json(
      { error_code: 'INTERNAL', error: 'Failed to submit interest' },
      { status: 500 }
    );
  }

  // Best-effort notification — the row already persisted.
  await sendGigInquiryEmail({
    inquiryId: inserted.inquiry_id,
    gigId,
    studentName,
    studentEmail,
    message,
  });

  return NextResponse.json({ ok: true, inquiry_id: inserted.inquiry_id });
}
