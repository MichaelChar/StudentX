import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  cleanupFreshOrphanAuthUser,
} from '@/lib/supabaseServer';
import {
  STUDENT_PROFILE_SELECT,
  parseProfileUpdates,
  ageFromDateOfBirth,
} from '@/lib/studentProfileFields';

function shapeStudent(student) {
  if (!student) return null;
  return {
    ...student,
    languages: Array.isArray(student.languages) ? student.languages : [],
    age: ageFromDateOfBirth(student.date_of_birth),
  };
}

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const authedSupabase = getSupabaseWithToken(token);
  const { data: student, error } = await authedSupabase
    .from('students')
    .select(STUDENT_PROFILE_SELECT)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch student profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }

  return NextResponse.json({ student: shapeStudent(student) });
}

/**
 * PATCH /api/student/profile — update guest-profile fields (and display_name).
 * Fields are individually optional here; completeness is enforced at booking.
 */
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

  const parsed = parseProfileUpdates(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field, error_code: 'INVALID_PROFILE' },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 });
  }

  const authedSupabase = getSupabaseWithToken(token);
  const { data: student, error } = await authedSupabase
    .from('students')
    .update({
      ...parsed.updates,
      updated_at: new Date().toISOString(),
    })
    .eq('auth_user_id', user.id)
    .select(STUDENT_PROFILE_SELECT)
    .maybeSingle();

  if (error) {
    console.error('Failed to update student profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
  if (!student) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json({ student: shapeStudent(student) });
}

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  // Greek removed in Step B (issue #158): only forward 'en'; anything else
  // (including the now-deprecated 'el') becomes empty so the RPC's
  // COALESCE-to-'en' fallback wins.
  const preferredLocale = body.preferred_locale === 'en' ? 'en' : '';

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
    // prevent_dual_role trigger (migration 036) RAISEs unique_violation
    // when the auth user already has a landlord row. Surface that as 409.
    if (error.code === '23505' && /already registered as a landlord/i.test(error.message || '')) {
      await cleanupFreshOrphanAuthUser(user);
      return NextResponse.json(
        { error: 'role_conflict', conflict_role: 'landlord' },
        { status: 409 }
      );
    }
    console.error('create_student_profile RPC error:', error);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }

  // Postgres functions returning a record come back as a single object
  // (not wrapped in an array) when called via PostgREST.
  const student = Array.isArray(rows) ? rows[0] : rows;
  return NextResponse.json({ student }, { status: 201 });
}
