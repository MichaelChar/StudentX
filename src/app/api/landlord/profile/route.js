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
    .select('landlord_id, name, email, contact_info, onboarding_completed, preferred_locale')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !landlord) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json({ landlord });
}

export async function PATCH(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Whitelist updatable fields. preferred_locale is the only one for now.
  // Email + name are owned by other flows (auth signup, onboarding).
  const updates = {};
  if (body.preferred_locale !== undefined) {
    if (body.preferred_locale !== 'el' && body.preferred_locale !== 'en') {
      return NextResponse.json(
        { error: "preferred_locale must be 'el' or 'en'" },
        { status: 400 }
      );
    }
    updates.preferred_locale = body.preferred_locale;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 });
  }

  // RLS UPDATE policy on landlords requires auth_user_id = auth.uid(),
  // so we use the user-token client (not the anon service client).
  const authedSupabase = getSupabaseWithToken(token);
  const { data: landlord, error } = await authedSupabase
    .from('landlords')
    .update(updates)
    .eq('auth_user_id', user.id)
    .select('landlord_id, name, email, contact_info, onboarding_completed, preferred_locale')
    .single();

  if (error || !landlord) {
    console.error('Failed to update landlord profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
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
    // Use SECURITY DEFINER function to link orphan record (RLS UPDATE policy
    // requires auth_user_id = auth.uid(), but orphan has auth_user_id = null)
    const authedSupabase = getSupabaseWithToken(token);
    const { error: linkError } = await authedSupabase.rpc('link_orphan_landlord', {
      p_landlord_id: orphan.landlord_id,
    });
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
