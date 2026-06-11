import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { newPendingLandlordId } from '@/lib/pendingIds';

export const dynamic = 'force-dynamic';

// GET /api/admin/pending-landlords — all pending landlords + all pending listings
// (used to refresh the dashboard after client-side mutations).
export async function GET(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = getSupabaseAsService();
  const [{ data: landlords }, { data: listings }] = await Promise.all([
    supabase.from('pending_landlords').select('*').order('created_at', { ascending: false }),
    supabase.from('pending_listings').select('*').order('created_at', { ascending: false }),
  ]);
  return NextResponse.json({ landlords: landlords || [], listings: listings || [] });
}

// POST /api/admin/pending-landlords  { display_name?, phone?, email?, notes? }
export async function POST(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const supabase = getSupabaseAsService();
  const id = newPendingLandlordId();
  const { data, error } = await supabase
    .from('pending_landlords')
    .insert({
      id,
      display_name: body.display_name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      notes: body.notes ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id, landlord: data }, { status: 201 });
}
