import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function isAdmin(user) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
  return adminEmails.includes(user.email);
}

export async function PATCH(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, notes } = body;
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Fetch the request
  const { data: verificationRequest, error: fetchError } = await supabase
    .from('verification_requests')
    .select('id, landlord_id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchError || !verificationRequest) {
    return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
  }

  if (verificationRequest.status !== 'pending') {
    return NextResponse.json({ error: 'Request has already been reviewed' }, { status: 409 });
  }

  // Update verification_requests row
  const { error: updateError } = await supabase
    .from('verification_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
    })
    .eq('id', id);

  if (updateError) {
    console.error('Failed to update verification_request:', updateError);
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
  }

  // On approve: flip is_verified only. Subscription tier (verified_tier) is
  // independent — the public badge requires both is_verified=true AND a paid
  // tier, so admin ID approval shouldn't grant a free subscription.
  if (action === 'approve') {
    const { error: landlordError } = await supabase
      .from('landlords')
      .update({ is_verified: true })
      .eq('landlord_id', verificationRequest.landlord_id);

    if (landlordError) {
      console.error('Failed to update landlord is_verified:', landlordError);
      return NextResponse.json({ error: 'Request approved but failed to update landlord status' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
