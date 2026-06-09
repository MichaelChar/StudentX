import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { getAiBinding } from '@/lib/cloudflareEnv';
import { buildPendingListing } from '@/lib/pendingIngest';
import { newPendingListingId } from '@/lib/pendingIds';

// POST /api/admin/ingest-listing  { url, pending_landlord_id? }
// Fetches the URL, extracts fields via Workers AI, downloads photos to R2-equiv
// (pending-photos Storage bucket), and writes a pending_listings row.
export async function POST(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'A valid http(s) url is required' }, { status: 400 });
  }

  const ai = getAiBinding();
  if (!ai) {
    return NextResponse.json(
      { error: 'Workers AI binding unavailable. Ingest runs on preview/deploy, not in next dev.' },
      { status: 503 }
    );
  }

  const supabase = getSupabaseAsService();
  const id = newPendingListingId();
  const pendingLandlordId = typeof body?.pending_landlord_id === 'string' ? body.pending_landlord_id : null;

  const row = await buildPendingListing({ url, ai, supabase, id });
  const status = pendingLandlordId && row.status === 'pending' ? 'assigned' : row.status;

  const { error } = await supabase.from('pending_listings').insert({ id, pending_landlord_id: pendingLandlordId, ...row, status });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id,
    status,
    preview: {
      address: row.address ?? null,
      neighborhood: row.neighborhood ?? null,
      beds: row.beds ?? null,
      baths: row.baths ?? null,
      sqm: row.sqm ?? null,
      price_eur_month: row.price_eur_month ?? null,
      property_type: row.property_type ?? null,
      description: row.description ?? null,
      photos: Array.isArray(row.photos_json) ? row.photos_json.length : 0,
      contact_phone: row.contact_phone_extracted ?? null,
      contact_email: row.contact_email_extracted ?? null,
    },
  });
}
