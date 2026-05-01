import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';
import { getSupabase } from '@/lib/supabase';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

async function getLandlordId(userId) {
  const { data } = await getSupabase()
    .from('landlords')
    .select('landlord_id, verified_tier, is_verified')
    .eq('auth_user_id', userId)
    .single();
  return data ?? null;
}

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlord = await getLandlordId(user.id);
  if (!landlord) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  // Guard: ID already approved. Subscription tier alone doesn't block ID
  // upload — landlords need both a paid tier AND an approved ID for the
  // public badge, and the subscription often happens before ID submission.
  if (landlord.is_verified === true) {
    return NextResponse.json({ error: 'Account is already verified' }, { status: 400 });
  }

  // Guard: pending request already exists
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from('verification_requests')
    .select('id')
    .eq('landlord_id', landlord.landlord_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'A pending verification request already exists', requestId: existing.id }, { status: 409 });
  }

  // Parse multipart form
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('id_document');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'id_document file is required' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not allowed. Upload JPEG, PNG, WebP, or PDF.' }, { status: 400 });
  }

  // Build storage path
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${landlord.landlord_id}/${timestamp}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('landlord-verification-docs')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }

  // Insert verification request
  const { data: requestRow, error: insertError } = await supabase
    .from('verification_requests')
    .insert({
      landlord_id: landlord.landlord_id,
      id_document_path: storagePath,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Insert verification request error:', insertError);
    return NextResponse.json({ error: 'Failed to submit verification request' }, { status: 500 });
  }

  return NextResponse.json({ success: true, requestId: requestRow.id });
}

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlord = await getLandlordId(user.id);
  if (!landlord) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('verification_requests')
    .select('id, status, submitted_at, reviewed_at, review_notes')
    .eq('landlord_id', landlord.landlord_id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch verification status' }, { status: 500 });
  }

  return NextResponse.json({
    verifiedTier: landlord.verified_tier ?? 'none',
    isVerified: landlord.is_verified === true,
    latestRequest: data ?? null,
  });
}
