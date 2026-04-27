import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
} from '@/lib/supabaseServer';

const MAX_BODY_LEN = 4000;

async function authedClient(request) {
  const token = extractToken(request);
  if (!token) return { error: 401 };
  const user = await getUserFromToken(token);
  if (!user) return { error: 401 };
  return { user, supabase: getSupabaseWithToken(token) };
}

async function resolveSenderRole(supabase, userId, inquiryId) {
  // Decide which sender_role to attach by checking which side of the
  // inquiry the caller belongs to. RLS will reject the insert anyway if
  // the caller doesn't own the thread, but resolving here keeps the
  // server in charge of the role label (clients can't spoof it).
  const { data: studentMatch } = await supabase
    .from('inquiries')
    .select('inquiry_id')
    .eq('inquiry_id', inquiryId)
    .eq('student_user_id', userId)
    .maybeSingle();
  if (studentMatch) return 'student';

  const { data: landlordMatch } = await supabase
    .from('inquiries')
    .select(`
      inquiry_id,
      listings!inner ( landlord_id, landlords!inner ( auth_user_id ) )
    `)
    .eq('inquiry_id', inquiryId)
    .eq('listings.landlords.auth_user_id', userId)
    .maybeSingle();
  if (landlordMatch) return 'landlord';

  return null;
}

export async function GET(request, { params }) {
  const auth = await authedClient(request);
  if (auth.error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.error });
  }
  const { user, supabase } = auth;
  const { inquiry_id: inquiryId } = await params;

  // RLS limits visibility to participants — no extra check needed here.
  const { data, error } = await supabase
    .from('inquiry_messages')
    .select('message_id, inquiry_id, sender_user_id, sender_role, body, read_at, created_at')
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch inquiry messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  return NextResponse.json({ messages: data, viewer_user_id: user.id });
}

export async function POST(request, { params }) {
  const auth = await authedClient(request);
  if (auth.error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.error });
  }
  const { user, supabase } = auth;
  const { inquiry_id: inquiryId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!messageBody) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (messageBody.length > MAX_BODY_LEN) {
    return NextResponse.json(
      { error: `body must be at most ${MAX_BODY_LEN} characters` },
      { status: 400 }
    );
  }

  const role = await resolveSenderRole(supabase, user.id, inquiryId);
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('inquiry_messages')
    .insert({
      inquiry_id: inquiryId,
      sender_user_id: user.id,
      sender_role: role,
      body: messageBody,
    })
    .select('message_id, inquiry_id, sender_user_id, sender_role, body, read_at, created_at')
    .single();

  if (error) {
    if (error.code === 'P0010') {
      return NextResponse.json(
        { error_code: 'CHAT_RATE_LIMIT', error: 'Too many messages.' },
        { status: 429 }
      );
    }
    console.error('Failed to insert inquiry message:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }

  return NextResponse.json({ message: data }, { status: 201 });
}
