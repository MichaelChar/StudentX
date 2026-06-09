import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';

const EDITABLE = ['display_name', 'phone', 'email', 'notes'];

// PATCH /api/admin/pending-landlords/:id  { display_name?, phone?, email?, notes? }
export async function PATCH(request, { params }) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const patch = {};
  for (const key of EDITABLE) {
    if (key in body) patch[key] = body[key];
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  const supabase = getSupabaseAsService();
  const { data, error } = await supabase.from('pending_landlords').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Pending landlord not found' }, { status: 404 });
  return NextResponse.json({ landlord: data });
}
