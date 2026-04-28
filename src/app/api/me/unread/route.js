import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ count: 0, role: null }, { headers: NO_STORE });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ count: 0, role: null }, { headers: NO_STORE });
  }

  const authed = getSupabaseWithToken(token);

  // Student first — direct lookup, RLS already restricts to own rows.
  const { data: studentRow } = await authed
    .from('students')
    .select('student_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (studentRow) {
    const { data } = await authed
      .from('inquiries')
      .select('student_unread_count')
      .eq('student_user_id', user.id);
    const count = (data ?? []).reduce(
      (sum, row) => sum + (row.student_unread_count || 0),
      0
    );
    return NextResponse.json({ count, role: 'student' }, { headers: NO_STORE });
  }

  // Landlord path — must join through listings since inquiries has no
  // direct landlord_id column (migration 026 confirms).
  const { data: landlordRow } = await getSupabase()
    .from('landlords')
    .select('landlord_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (landlordRow?.landlord_id) {
    const { data } = await authed
      .from('inquiries')
      .select('landlord_unread_count, listings!inner(landlord_id)')
      .eq('listings.landlord_id', landlordRow.landlord_id);
    const count = (data ?? []).reduce(
      (sum, row) => sum + (row.landlord_unread_count || 0),
      0
    );
    return NextResponse.json({ count, role: 'landlord' }, { headers: NO_STORE });
  }

  return NextResponse.json({ count: 0, role: null }, { headers: NO_STORE });
}
