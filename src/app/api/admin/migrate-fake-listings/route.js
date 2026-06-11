import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { loadFakeCandidates, migrateOneFake, deletePublicListing } from '@/lib/pendingMigrate';

export const dynamic = 'force-dynamic';

// GET — wizard data: the fake (non-protected) public listings, the protected
// landlord_ids (never touchable), and the pending landlords to assign into.
export async function GET(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = getSupabaseAsService();
  const { candidates, protectedLandlordIds } = await loadFakeCandidates(supabase);
  const { data: pendingLandlords } = await supabase
    .from('pending_landlords')
    .select('id, display_name, status')
    .order('created_at', { ascending: true });

  return NextResponse.json({ candidates, protectedLandlordIds, pendingLandlords: pendingLandlords || [] });
}

// POST  { assignments: { <listing_id>: <pending_landlord_id> | 'skip' } }
// For each: a pending landlord => stage into pending_listings (idempotent) then
// delete the public listing; 'skip'/'delete' => just delete the public listing.
// Protected/unknown listing_ids are refused server-side regardless of input.
export async function POST(request) {
  const gate = await requireAdminApi(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const assignments = body?.assignments && typeof body.assignments === 'object' ? body.assignments : null;
  if (!assignments) return NextResponse.json({ error: 'assignments object is required' }, { status: 400 });

  const supabase = getSupabaseAsService();

  // Safety net: only listing_ids that are genuinely fake (non-protected) and
  // still present may be acted on. Anything else is refused or treated as an
  // idempotent no-op — a protected listing can never be deleted here.
  const { candidates } = await loadFakeCandidates(supabase);
  const allowed = new Set(candidates.map((c) => c.listing_id));
  const { data: mig } = await supabase
    .from('pending_listings')
    .select('migrated_from_listing_id')
    .not('migrated_from_listing_id', 'is', null);
  const migratedSet = new Set((mig || []).map((m) => m.migrated_from_listing_id));

  let migrated = 0;
  let skipped = 0;
  const errors = [];

  for (const [listingId, target] of Object.entries(assignments)) {
    if (!allowed.has(listingId)) {
      // already migrated+deleted on a previous run => benign idempotent skip
      if (migratedSet.has(listingId)) skipped++;
      else errors.push(`${listingId}: refused (protected, unknown, or already removed)`);
      continue;
    }
    try {
      if (!target || target === 'skip' || target === 'delete') {
        await deletePublicListing({ supabase, listingId });
        skipped++;
      } else {
        const m = await migrateOneFake({ supabase, listingId, pendingLandlordId: target });
        if (m.action === 'error') {
          errors.push(`${listingId}: ${m.error}`);
          continue;
        }
        await deletePublicListing({ supabase, listingId });
        migrated++;
      }
    } catch (err) {
      errors.push(`${listingId}: ${err.message || err}`);
    }
  }

  return NextResponse.json({ migrated, skipped, errors: errors.length, errorDetail: errors });
}
