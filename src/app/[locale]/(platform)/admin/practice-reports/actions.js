'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';

const VALID_STATUSES = ['open', 'accepted', 'rejected', 'resolved'];

/**
 * Update a question_report's status and admin note.
 *
 * Gated by requireAdmin() — the SAME server-side cookie check the page uses, so
 * a client cannot mutate by posting to this action without an allowlisted
 * session (never trust client-side gating). Writes go through the service-role
 * client (bypasses RLS); the service-role key never leaves the server.
 *
 * @param {{ id: string, status: string, adminNote?: string | null }} input
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function updateReport({ id, status, adminNote }) {
  const admin = await requireAdmin();
  if (!admin || admin.kind === 'not-admin') {
    return { ok: false, error: 'forbidden' };
  }

  if (!id || !VALID_STATUSES.includes(status)) {
    return { ok: false, error: 'bad-request' };
  }

  const patch = {
    status,
    admin_note: adminNote?.trim() ? adminNote.trim() : null,
    // 'resolved' stamps resolved_at; any other status clears it so a report
    // re-opened or re-routed doesn't keep a stale resolution timestamp.
    resolved_at: status === 'resolved' ? new Date().toISOString() : null,
  };

  const supabase = getSupabaseAsService();
  const { error } = await supabase.from('question_reports').update(patch).eq('id', id);

  if (error) {
    return { ok: false, error: 'update-failed' };
  }

  // Re-fetch the server-rendered table so the row reflects the new status.
  revalidatePath('/admin/practice-reports');
  return { ok: true };
}
