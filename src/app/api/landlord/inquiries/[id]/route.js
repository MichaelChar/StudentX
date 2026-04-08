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

export async function PATCH(request, { params }) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const { id } = await params;
  const body = await request.json();

  const VALID_STATUSES = ['pending', 'replied', 'closed'];
  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates = { status: body.status };
  if (body.status === 'replied') {
    updates.replied_at = new Date().toISOString();
  }

  const authedSupabase = getSupabaseWithToken(token);
  const { data, error } = await authedSupabase
    .from('inquiries')
    .update(updates)
    .eq('inquiry_id', id)
    .select('inquiry_id, status, replied_at')
    .single();

  if (error) {
    console.error('Failed to update inquiry:', error);
    return NextResponse.json({ error: 'Failed to update inquiry' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
  }

  return NextResponse.json({ inquiry: data });
}
