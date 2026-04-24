import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: landlord, error } = await getSupabase()
    .from('landlords')
    .select('landlord_id, name, email, contact_info, onboarding_completed')
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
    .select('landlord_id, name, email, onboarding_completed')
    .eq('auth_user_id', user.id)
    .single();

  if (existing) return NextResponse.json({ landlord: existing });

  // Check if a landlord exists with the same email but no auth_user_id (e.g. seeded data)
  const { data: orphan } = await getSupabase()
    .from('landlords')
    .select('landlord_id, name, email, onboarding_completed')
    .eq('email', user.email)
    .is('auth_user_id', null)
    .single();

  if (orphan) {
    // Use service role to update orphan record (RLS UPDATE policy requires auth_user_id = auth.uid(),
    // but the orphan has auth_user_id = null so the user's token can't match)
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const { error: linkError } = await serviceClient
      .from('landlords')
      .update({ auth_user_id: user.id })
      .eq('landlord_id', orphan.landlord_id);
    if (linkError) {
      console.error('Failed to link landlord profile:', linkError);
      return NextResponse.json({ error: 'Failed to link profile' }, { status: 500 });
    }
    return NextResponse.json({ landlord: orphan });
  }

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
