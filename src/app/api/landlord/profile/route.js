import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
  getSupabaseAsService,
  cleanupFreshOrphanAuthUser,
} from '@/lib/supabaseServer';
import { normalizeSingleLine } from '@/lib/textNormalize';

// `landlords.name` is PUBLIC — students see it as "Listed by …" on every card,
// the PDP and the landlord profile. It must never be derived from the email:
// the old `email.split('@')[0]` fallback published the local part of a
// landlord's address and read like a username.
const NAME_MAX_LENGTH = 80;

function landlordName(value) {
  // normalizeSingleLine String()s its input, so {} would be stored as
  // "[object Object]" and 42 as "42". Only a string is a name.
  if (typeof value !== 'string') return { ok: false, error: 'name_required' };
  const name = normalizeSingleLine(value);
  if (!name) return { ok: false, error: 'name_required' };
  if (name.length > NAME_MAX_LENGTH) return { ok: false, error: 'name_too_long' };
  return { ok: true, value: name };
}

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

  // Public display name — Settings → Display name. Same rules as signup.
  if (body.name !== undefined) {
    const nameRes = landlordName(body.name);
    if (!nameRes.ok) {
      return NextResponse.json({ error: nameRes.error }, { status: 400 });
    }
    updates.name = nameRes.value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 });
  }

  /*
    Which client writes depends on the columns, because migration 108 made
    column GRANTS the gate on this table:

    - preferred_locale / profile_photo_url are granted UPDATE to
      `authenticated`, so they go through the caller's own token and the
      "update their own record" RLS policy, as before.
    - `name` is deliberately NOT granted. Granting it would let any landlord
      JWT set its public name straight through PostgREST, skipping
      landlordName() — blank names, 10 000 characters, "StudentX Team". So the
      route stays the only way in: the name write uses the service role,
      scoped by `user.id`, which comes from the verified JWT and never from
      the body. Same pattern as the landlord listing routes.

    One UPDATE either way, so a request carrying name + photo cannot half-apply.
  */
  let writer;
  if (updates.name !== undefined) {
    try {
      writer = getSupabaseAsService();
    } catch (err) {
      console.error('Landlord name update needs the service role:', err);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
  } else {
    writer = getSupabaseWithToken(token);
  }
  const { data: landlord, error } = await writer
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

  /*
    Both reads run on the CALLER'S OWN TOKEN, not the service-role key.

    Migration 065 removed `email`, `onboarding_completed` and `auth_user_id`
    from the **anon** column allowlist; `authenticated` kept all three, and
    getSupabaseWithToken sends the caller's JWT, so PostgREST runs these as
    `authenticated`. RLS permits them too (landlords SELECT is public/true).

    The orphan read looks at a row that is not yet the caller's, which is the
    point of it — but it can only ever match `user.email`, which is JWT-derived.
    A caller cannot widen it to somebody else's row.
  */
  const selfSupabase = getSupabaseWithToken(token);

  // Return existing profile if already created
  const { data: existing } = await selfSupabase
    .from('landlords')
    .select('landlord_id, name, email, onboarding_completed')
    .eq('auth_user_id', user.id)
    .single();

  if (existing) return NextResponse.json({ landlord: existing });

  // Check if a landlord exists with the same email but no auth_user_id (e.g. seeded data)
  const { data: orphan } = await selfSupabase
    .from('landlords')
    .select('landlord_id, name, email, onboarding_completed')
    .eq('email', user.email)
    .is('auth_user_id', null)
    .single();

  if (orphan) {
    // Use SECURITY DEFINER function to link orphan record (RLS UPDATE policy
    // requires auth_user_id = auth.uid(), but orphan has auth_user_id = null)
    const authedSupabase = getSupabaseWithToken(token);
    const { data: linked, error: linkError } = await authedSupabase.rpc(
      'link_orphan_landlord',
      { p_landlord_id: orphan.landlord_id }
    );
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
    // A no-op is not an error: link_orphan_landlord's UPDATE simply matches
    // no row when a guard fails — most importantly when the caller's email
    // is unconfirmed (migration 112). Before it returned boolean, that case
    // was indistinguishable from success and this route answered
    // `{ landlord: orphan }`, telling the client it had claimed an account
    // it had NOT claimed. Answer 403 instead.
    if (!linked) {
      return NextResponse.json({ error: 'link_not_permitted' }, { status: 403 });
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
  // A name is required — see landlordName(). The signup form always sends
  // one; a missing name is a client bug, not something to paper over.
  const nameRes = landlordName(body.name);
  if (!nameRes.ok) {
    return NextResponse.json({ error: nameRes.error }, { status: 400 });
  }
  const name = nameRes.value;

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

