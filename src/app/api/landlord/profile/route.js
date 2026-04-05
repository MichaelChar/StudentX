import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: landlord, error } = await getSupabase()
    .from('landlords')
    .select('landlord_id, name, email, contact_info')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !landlord) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json({ landlord });
}

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Return existing profile if already created
  const { data: existing } = await getSupabase()
    .from('landlords')
    .select('landlord_id, name, email')
    .eq('auth_user_id', user.id)
    .single();

  if (existing) return NextResponse.json({ landlord: existing });

  // Generate next 4-digit landlord_id
  const { data: rows } = await getSupabase()
    .from('landlords')
    .select('landlord_id')
    .order('landlord_id', { ascending: false })
    .limit(1);

  const maxId = rows?.length > 0 ? parseInt(rows[0].landlord_id, 10) : 0;
  const nextId = String(maxId + 1).padStart(4, '0');

  const body = await request.json().catch(() => ({}));
  const name = body.name?.trim() || user.email.split('@')[0];

  const authedSupabase = getSupabaseWithToken(token);
  const { data: landlord, error } = await authedSupabase
    .from('landlords')
    .insert({
      landlord_id: nextId,
      name,
      contact_info: user.email,
      auth_user_id: user.id,
      email: user.email,
    })
    .select('landlord_id, name, email')
    .single();

  if (error) {
    console.error('Failed to create landlord profile:', error);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }

  return NextResponse.json({ landlord }, { status: 201 });
}
