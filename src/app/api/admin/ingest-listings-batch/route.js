import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { getAiBinding, getExecutionCtx } from '@/lib/cloudflareEnv';
import { buildPendingListing } from '@/lib/pendingIngest';
import { sourceTagFromUrl } from '@/lib/pendingMappers';
import { newPendingListingId } from '@/lib/pendingIds';

const MAX_BATCH = 25;

// POST /api/admin/ingest-listings-batch  { urls: [string], pending_landlord_id? }
// Inserts a placeholder pending_listings row per url immediately, then processes
// fetch + extraction + photos in the background (ctx.waitUntil on the Worker;
// inline fallback in dev). Returns one { url, id, status:'queued' } per url.
export async function POST(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const urls = Array.isArray(body?.urls)
    ? body.urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())).map((u) => u.trim())
    : [];
  if (!urls.length) return NextResponse.json({ error: 'urls must be a non-empty array of http(s) links' }, { status: 400 });
  if (urls.length > MAX_BATCH) return NextResponse.json({ error: `Batch capped at ${MAX_BATCH} urls` }, { status: 400 });

  const ai = getAiBinding();
  if (!ai) {
    return NextResponse.json({ error: 'Workers AI binding unavailable (run on preview/deploy)' }, { status: 503 });
  }

  const supabase = getSupabaseAsService();
  const pendingLandlordId = typeof body?.pending_landlord_id === 'string' ? body.pending_landlord_id : null;
  const items = urls.map((url) => ({ url, id: newPendingListingId() }));

  const { error: insErr } = await supabase.from('pending_listings').insert(
    items.map((it) => ({
      id: it.id,
      pending_landlord_id: pendingLandlordId,
      source_url: it.url,
      source_type: sourceTagFromUrl(it.url),
      status: 'pending',
      photos_json: [],
    }))
  );
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const work = (async () => {
    for (const it of items) {
      try {
        const row = await buildPendingListing({ url: it.url, ai, supabase, id: it.id });
        const status = pendingLandlordId && row.status === 'pending' ? 'assigned' : row.status;
        await supabase.from('pending_listings').update({ ...row, status }).eq('id', it.id);
      } catch {
        await supabase.from('pending_listings').update({ status: 'error' }).eq('id', it.id);
      }
    }
  })();

  const exec = getExecutionCtx();
  if (exec?.waitUntil) exec.waitUntil(work);
  else await work; // dev: no execution ctx, process inline before responding

  return NextResponse.json({ results: items.map((it) => ({ url: it.url, id: it.id, status: 'queued' })) });
}
