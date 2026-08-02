import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import {
  PROPERTY_VERIFICATION_CHECKLIST,
  isPendingPropertyVerificationRow,
} from '@/lib/propertyVerification';
import {
  sendPropertyVerificationApprovedEmail,
  sendPropertyVerificationRejectedEmail,
} from '@/lib/propertyVerificationEmail';

/**
 * PATCH /api/admin/property-verifications/[id]
 * Body: { action: 'approve' | 'reject', notes?, checklist? }
 *
 * Approve: sets verified_at = now(), verified_by = admin email, stores checklist.
 * Reject: leaves verified_at NULL, sets checklist_json.outcome = 'rejected', notes.
 */
export async function PATCH(request, { params }) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing verification id' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, notes, checklist } = body || {};
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAsService();

  const { data: row, error: fetchError } = await supabase
    .from('property_verifications')
    .select(
      'verification_id, listing_id, method, verified_at, checklist_json, notes',
    )
    .eq('verification_id', id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
  }

  if (!isPendingPropertyVerificationRow(row)) {
    return NextResponse.json(
      { error: 'Request has already been reviewed' },
      { status: 409 },
    );
  }

  if (action === 'approve') {
    const checklistJson = {};
    for (const key of PROPERTY_VERIFICATION_CHECKLIST) {
      checklistJson[key] = Boolean(checklist?.[key]);
    }
    // Require all checklist items for approve — video call must tick every box.
    const allTicked = PROPERTY_VERIFICATION_CHECKLIST.every((k) => checklistJson[k]);
    if (!allTicked) {
      return NextResponse.json(
        { error: 'All checklist items must be confirmed before approving' },
        { status: 400 },
      );
    }

    const verifiedAt = new Date().toISOString();
    const verifiedBy = gate.user?.email || 'admin';

    const { error: updateError } = await supabase
      .from('property_verifications')
      .update({
        verified_at: verifiedAt,
        verified_by: verifiedBy,
        checklist_json: checklistJson,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      })
      .eq('verification_id', id);

    if (updateError) {
      console.error('Failed to approve property verification:', updateError);
      return NextResponse.json({ error: 'Failed to approve request' }, { status: 500 });
    }

    // Best-effort email — never fail the mutation on Resend.
    await sendPropertyVerificationApprovedEmail({
      listingId: row.listing_id,
      method: row.method || 'video_call',
      verifiedAt,
    });

    return NextResponse.json({ success: true, verified_at: verifiedAt });
  }

  // reject
  const rejectNotes =
    typeof notes === 'string' && notes.trim() ? notes.trim() : null;

  const { error: rejectError } = await supabase
    .from('property_verifications')
    .update({
      verified_at: null,
      verified_by: gate.user?.email || 'admin',
      checklist_json: { outcome: 'rejected' },
      notes: rejectNotes,
    })
    .eq('verification_id', id);

  if (rejectError) {
    console.error('Failed to reject property verification:', rejectError);
    return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 });
  }

  await sendPropertyVerificationRejectedEmail({
    listingId: row.listing_id,
    notes: rejectNotes,
  });

  return NextResponse.json({ success: true });
}
