import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const authedSupabase = getSupabaseWithToken(token);
  const { data: student, error } = await authedSupabase
    .from('students')
    .select('student_id, email, display_name, preferred_locale, created_at')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch student profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }

  return NextResponse.json({ student });
}

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const preferredLocale =
    body.preferred_locale === 'el' || body.preferred_locale === 'en'
      ? body.preferred_locale
      : '';

  // create_student_profile is SECURITY DEFINER and idempotent — calling
  // it for an already-provisioned auth.users row returns the existing
  // row, so this endpoint doubles as a "sync profile" probe used by
  // SessionSync after a fresh signup.
  const authedSupabase = getSupabaseWithToken(token);
  const { data: rows, error } = await authedSupabase.rpc('create_student_profile', {
    p_display_name: displayName,
    p_preferred_locale: preferredLocale,
  });

  if (error) {
    console.error('create_student_profile RPC error:', error);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }

  // Postgres functions returning a record come back as a single object
  // (not wrapped in an array) when called via PostgREST.
  const student = Array.isArray(rows) ? rows[0] : rows;
  return NextResponse.json({ student }, { status: 201 });
}
