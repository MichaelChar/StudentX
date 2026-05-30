import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

// Per-user data — never cache.
const NO_STORE = { 'Cache-Control': 'private, no-store' };

// listings.listing_id is a 7-digit text PK (migration 001). Reject
// anything else before it reaches the DB / RLS layer.
const LISTING_ID_RE = /^\d{7}$/;

function unauthenticated() {
  return NextResponse.json(
    { error: 'UNAUTHENTICATED' },
    { status: 401, headers: NO_STORE },
  );
}

/**
 * Resolve the caller to a student row from the Bearer token. Returns
 * either { supabase, studentId } (token-scoped client + the caller's
 * students PK) or { error } — a ready-to-return 401 — when there's no
 * token, the token is invalid, or the caller isn't a student (e.g. a
 * landlord). Mirrors the auth shape of /api/me/unread.
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

// GET — list the signed-in student's favourites, newest first.
export async function GET(request) {
  const ctx = await resolveStudent(request);
  if (ctx.error) return ctx.error;

  const { data, error } = await ctx.supabase
    .from('student_favorites')
    .select('listing_id, created_at')
    .eq('student_id', ctx.studentId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'FETCH_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ favorites: data ?? [] }, { headers: NO_STORE });
}

// POST { listing_id } — add a favourite. Idempotent: re-hearting an
// already-saved listing returns ok rather than surfacing the unique
// violation.
export async function POST(request) {
  const ctx = await resolveStudent(request);
  if (ctx.error) return ctx.error;

  const body = await request.json().catch(() => ({}));
  const listingId = typeof body.listing_id === 'string' ? body.listing_id.trim() : '';
  if (!LISTING_ID_RE.test(listingId)) {
    return NextResponse.json(
      { error: 'INVALID_LISTING_ID' },
      { status: 400, headers: NO_STORE },
    );
  }

  const { error } = await ctx.supabase
    .from('student_favorites')
    .insert({ student_id: ctx.studentId, listing_id: listingId });

  if (error) {
    if (error.code === '23505') {
      // unique_violation — already shortlisted. Treat as success.
      return NextResponse.json({ ok: true, already: true }, { headers: NO_STORE });
    }
    if (error.code === '23503') {
      // foreign_key_violation — the listing doesn't exist.
      return NextResponse.json(
        { error: 'LISTING_NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { error: 'SAVE_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}

// DELETE ?listing_id=… — remove a favourite. The id rides in the query
// string (not a body) so the request stays body-less, which is the
// safest shape for DELETE across the Workers runtime. RLS already binds
// the delete to the caller's rows; the explicit student_id eq is
// belt-and-braces and lets the planner use the PK index.
export async function DELETE(request) {
  const ctx = await resolveStudent(request);
  if (ctx.error) return ctx.error;

  const listingId = (new URL(request.url).searchParams.get('listing_id') || '').trim();
  if (!LISTING_ID_RE.test(listingId)) {
    return NextResponse.json(
      { error: 'INVALID_LISTING_ID' },
      { status: 400, headers: NO_STORE },
    );
  }

  const { error } = await ctx.supabase
    .from('student_favorites')
    .delete()
    .eq('student_id', ctx.studentId)
    .eq('listing_id', listingId);

  if (error) {
    return NextResponse.json(
      { error: 'DELETE_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
