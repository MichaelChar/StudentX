import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';

// POST /api/admin/pending-listings/:id/assign  { pending_landlord_id }
// Links a pending listing to a pending landlord.
export async function POST(request, { params }) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const pendingLandlordId = typeof body?.pending_landlord_id === 'string' ? body.pending_landlord_id : null;
  if (!pendingLandlordId) {
    return NextResponse.json({ error: 'pending_landlord_id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAsService();

  const { data: landlord } = await supabase.from('pending_landlords').select('id').eq('id', pendingLandlordId).maybeSingle();
  if (!landlord) return NextResponse.json({ error: 'pending_landlord_id not found' }, { status: 404 });

  const { data: current } = await supabase.from('pending_listings').select('status').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Pending listing not found' }, { status: 404 });

  // Don't clobber a needs_manual_entry / error / published flag — only a plain
  // 'pending' row graduates to 'assigned'.
  const nextStatus = current.status === 'pending' ? 'assigned' : current.status;

  const { data, error } = await supabase
    .from('pending_listings')
    .update({ pending_landlord_id: pendingLandlordId, status: nextStatus })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}
