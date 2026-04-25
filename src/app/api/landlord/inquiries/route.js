import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

async function getLandlordId(userId) {
  const { data } = await getSupabase()
    .from('landlords')
    .select('landlord_id')
    .eq('auth_user_id', userId)
    .single();
  return data?.landlord_id ?? null;
}

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const includeCounts = searchParams.get('counts') === '1';

  const authedSupabase = getSupabaseWithToken(token);
  let query = authedSupabase
    .from('inquiries')
    .select(`
      inquiry_id,
      listing_id,
      student_name,
      student_email,
      student_phone,
      message,
      status,
      replied_at,
      created_at,
      listings ( listing_id, location ( address ) )
    `)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch inquiries:', error);
    return NextResponse.json({ error: 'Failed to fetch inquiries' }, { status: 500 });
  }

  const response = { inquiries: data };

  if (includeCounts) {
    const { count: pendingCount, error: countError } = await authedSupabase
      .from('inquiries')
      .select('inquiry_id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (countError) {
      console.error('Failed to fetch inquiry counts:', countError);
    } else {
      response.pending_count = pendingCount ?? 0;
    }
  }

  return NextResponse.json(response);
}
