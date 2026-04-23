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

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('verification_requests')
    .select(`
      id,
      status,
      id_document_path,
      submitted_at,
      reviewed_at,
      review_notes,
      landlord_id,
      landlords ( name )
    `)
    .eq('status', status)
    .order('submitted_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch verification requests:', error);
    return NextResponse.json({ error: 'Failed to fetch verification requests' }, { status: 500 });
  }

  // Generate signed URLs for each document
  const requests = await Promise.all(
    (data || []).map(async (row) => {
      const { data: signedData } = await supabase.storage
        .from('landlord-verification-docs')
        .createSignedUrl(row.id_document_path, 3600); // 1 hour
      return {
        ...row,
        landlord_name: row.landlords?.name ?? 'Unknown',
        document_url: signedData?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ requests });
}
