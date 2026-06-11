import { NextResponse } from 'next/server';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { loadClaimContext, publishPendingLandlord } from '@/lib/pendingPublish';

// POST /api/claim/:token/publish  { edits?: { landlord?, listings? } }
// PUBLIC but token-gated: the unguessable claim token IS the authorisation, so
// there is no admin/Supabase session here. Moves the landlord + their pending
// listings into the public star schema. Idempotent (re-clicking is safe).
export async function POST(request, { params }) {
  const { token } = await params;
  const supabase = getSupabaseAsService();

  const ctx = await loadClaimContext(supabase, token);
  if (!ctx) {
    return NextResponse.json({ error: 'This claim link is invalid or has expired.' }, { status: 410 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const edits = body?.edits && typeof body.edits === 'object' ? body.edits : {};

  const result = await publishPendingLandlord({ supabase, landlord: ctx.landlord, edits });
  if (!result.landlordId) {
    return NextResponse.json({ error: 'Publish failed', detail: result.errors }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    landlord_id: result.landlordId,
    published: result.published,
    errors: result.errors,
    already_published: result.alreadyPublished,
  });
}
