import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

// Tiny role probe used by the navbar and any client component that needs
// to render different UI for students vs landlords without re-fetching
// both profile tables itself. Returns null when unauthenticated rather
// than 401, because the navbar mounts on every page including the home
// page where unauthenticated is the normal case.
export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ user: null });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ user: null });

  const supabase = getSupabaseWithToken(token);

  const [studentRes, landlordRes] = await Promise.all([
    supabase.from('students').select('display_name').eq('auth_user_id', user.id).maybeSingle(),
    supabase.from('landlords').select('name').eq('auth_user_id', user.id).maybeSingle(),
  ]);

  const student = studentRes.data;
  const landlord = landlordRes.data;

  let role = null;
  let name = null;
  if (student) {
    role = 'student';
    name = student.display_name;
  } else if (landlord) {
    role = 'landlord';
    name = landlord.name;
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role,
      name,
    },
  });
}
