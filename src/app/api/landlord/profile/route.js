import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  cleanupFreshOrphanAuthUser,
} from '@/lib/supabaseServer';
import { normalizeSingleLine } from '@/lib/textNormalize';

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Token-scoped (authenticated) client, not the anon client: this row
  // carries owner-only PII (email, contact_info). A follow-up migration
  // revokes anon SELECT on contact_info, so the owner read must run as the
  // authenticated role. RLS already lets a landlord read their own row.
  const { data: landlord, error } = await getSupabaseWithToken(token)
    .from('landlords')
    .select('landlord_id, name, email, contact_info, onboarding_completed, preferred_locale, profile_photo_url')
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

  // Whitelist updatable fields. preferred_locale was the only one and the
  // settings UI has been removed (issue #158, Step B). We still accept
  // explicit 'en' for any legacy client that hasn't refreshed; 'el' is
  // rejected because Greek is no longer supported. The column itself is
  // scheduled for removal in the schema cleanup follow-up.
  const updates = {};
  if (body.preferred_locale !== undefined) {
    if (body.preferred_locale !== 'en') {
      return NextResponse.json(
        { error: "preferred_locale must be 'en'" },
        { status: 400 }
      );
    }
    updates.preferred_locale = body.preferred_locale;
  }

  // Profile photo: a landlord sets/replaces/clears their public avatar. The
  // URL must point at our own landlord-photos bucket (the browser uploader's
  // getPublicUrl output) — see normalizeProfilePhotoUrl. null/'' clears it.
  if (body.profile_photo_url !== undefined) {
    const photoRes = normalizeProfilePhotoUrl(body.profile_photo_url);
    if (!photoRes.ok) {
      return NextResponse.json({ error: 'Invalid profile_photo_url' }, { status: 400 });
    }
    updates.profile_photo_url = photoRes.value;
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
    .select('landlord_id, name, email, contact_info, onboarding_completed, preferred_locale, profile_photo_url')
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
      if (isRoleConflict(linkError)) {
        await cleanupFreshOrphanAuthUser(user);
        return NextResponse.json(
          { error: 'role_conflict', conflict_role: 'student' },
          { status: 409 }
        );
      }
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
  // Normalize the supplied name; fall back to the email-prefix when missing
  // or empty after normalization. Email is owned by Supabase auth so it's
  // already trimmed and lowercased upstream.
  const name = normalizeSingleLine(body.name) || user.email.split('@')[0];

  // Optional avatar captured on the signup form. Validate it points at our own
  // bucket (same rule as PATCH) rather than storing an arbitrary URL; absent is
  // fine (most signups have no photo — they add one later in Settings).
  const photoRes = normalizeProfilePhotoUrl(body.profile_photo_url);
  if (!photoRes.ok) {
    return NextResponse.json({ error: 'Invalid profile_photo_url' }, { status: 400 });
  }

  const authedSupabase = getSupabaseWithToken(token);
  const { data: landlord, error } = await authedSupabase
    .from('landlords')
    .insert({
      landlord_id: nextId,
      name,
      contact_info: user.email,
      auth_user_id: user.id,
      email: user.email,
      profile_photo_url: photoRes.value,
    })
    .select('landlord_id, name, email')
    .single();

  if (error) {
    if (isRoleConflict(error)) {
      await cleanupFreshOrphanAuthUser(user);
      return NextResponse.json(
        { error: 'role_conflict', conflict_role: 'student' },
        { status: 409 }
      );
    }
    console.error('Failed to create landlord profile:', error);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }

  return NextResponse.json({ landlord }, { status: 201 });
}

// Postgres unique_violation raised by the prevent_dual_role trigger
// (migration 036) — the same email/auth user already has a students row.
function isRoleConflict(err) {
  return err?.code === '23505' && /already registered as a student/i.test(err?.message || '');
}

// Validate/normalize a landlord profile photo URL. It must be a public URL on
// our own Supabase storage `landlord-photos` bucket — exactly what the browser
// uploader's getPublicUrl() returns. Rejecting arbitrary URLs keeps a landlord
// from pointing their PUBLIC avatar at an off-site image (tracking/abuse) and
// keeps stored data consistent with the bucket the uploader writes to.
// `undefined` / null / '' all mean "no photo" → stored as NULL.
// Returns { ok: boolean, value?: string|null }.
function normalizeProfilePhotoUrl(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') return { ok: false };
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return { ok: false };
  const prefix = `${base.replace(/\/+$/, '')}/storage/v1/object/public/landlord-photos/`;
  if (!value.startsWith(prefix) || value.length > 1024) return { ok: false };
  return { ok: true, value };
}

