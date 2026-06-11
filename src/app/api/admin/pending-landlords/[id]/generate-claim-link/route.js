import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { newClaimToken } from '@/lib/pendingIds';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// POST /api/admin/pending-landlords/:id/generate-claim-link
// Mints a fresh claim token (30-day expiry), flips status to 'claim_sent', and
// returns the full magic link https://studentx.uk/claim/<token>.
export async function POST(request, { params }) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const supabase = getSupabaseAsService();
  const token = newClaimToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();

  const { data, error } = await supabase
    .from('pending_landlords')
    .update({ claim_token: token, claim_token_expires_at: expiresAt, status: 'claim_sent' })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Pending landlord not found' }, { status: 404 });

  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk').replace(/\/+$/, '');
  return NextResponse.json({ url: `${base}/claim/${token}`, claim_token: token, expires_at: expiresAt });
}
