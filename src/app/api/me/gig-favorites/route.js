import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

// Per-user data — never cache.
const NO_STORE = { 'Cache-Control': 'private, no-store' };

// gigs.gig_id is a UUID (migration 061). Reject anything else before it
// reaches the DB / RLS layer.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthenticated() {
  return NextResponse.json(
    { error: 'UNAUTHENTICATED' },
    { status: 401, headers: NO_STORE },
  );
}

/**
 * Resolve the caller to a student row from the Bearer token. Mirrors
 * /api/me/favorites (the accommodation shortlist) — same auth shape, gig table.
 */
async function resolveStudent(request) {
  const token = extractToken(request);
  if (!token) return { error: unauthenticated() };

  const user = await getUserFromToken(token);
  if (!user) return { error: unauthenticated() };

  const supabase = getSupabaseWithToken(token);
  const { data: student } = await supabase
    .from('students')
    .select('student_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!student) return { error: unauthenticated() };
  return { supabase, studentId: student.student_id };
}

// GET — list the signed-in student's saved gigs, newest first.
export async function GET(request) {
  const ctx = await resolveStudent(request);
  if (ctx.error) return ctx.error;

  const { data, error } = await ctx.supabase
    .from('gig_favorites')
    .select('gig_id, created_at')
    .eq('student_id', ctx.studentId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'FETCH_FAILED' }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ favorites: data ?? [] }, { headers: NO_STORE });
}

// POST { gig_id } — save a gig. Idempotent: re-saving returns ok.
export async function POST(request) {
  const ctx = await resolveStudent(request);
  if (ctx.error) return ctx.error;

  const body = await request.json().catch(() => ({}));
  const gigId = typeof body.gig_id === 'string' ? body.gig_id.trim() : '';
  if (!UUID_RE.test(gigId)) {
    return NextResponse.json({ error: 'INVALID_GIG_ID' }, { status: 400, headers: NO_STORE });
  }

  const { error } = await ctx.supabase
    .from('gig_favorites')
    .insert({ student_id: ctx.studentId, gig_id: gigId });

  if (error) {
    if (error.code === '23505') {
      // already saved — treat as success.
      return NextResponse.json({ ok: true, already: true }, { headers: NO_STORE });
    }
    if (error.code === '23503') {
      // the gig doesn't exist.
      return NextResponse.json({ error: 'GIG_NOT_FOUND' }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ error: 'SAVE_FAILED' }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}

// DELETE ?gig_id=… — unsave a gig. Id rides in the query string so the
// request stays body-less (safest DELETE shape on the Workers runtime).
export async function DELETE(request) {
  const ctx = await resolveStudent(request);
  if (ctx.error) return ctx.error;

  const gigId = (new URL(request.url).searchParams.get('gig_id') || '').trim();
  if (!UUID_RE.test(gigId)) {
    return NextResponse.json({ error: 'INVALID_GIG_ID' }, { status: 400, headers: NO_STORE });
  }

  const { error } = await ctx.supabase
    .from('gig_favorites')
    .delete()
    .eq('student_id', ctx.studentId)
    .eq('gig_id', gigId);

  if (error) {
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
