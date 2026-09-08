import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

/*
  View tracking. Anon-callable on purpose — a signed-out visitor's view counts.

  The write goes through `increment_listing_view`, which is SECURITY DEFINER as
  of #244. It used to be SECURITY INVOKER, which is why `listing_views` carried
  `FOR INSERT WITH CHECK (true)` and `FOR UPDATE USING (true)` granted to
  PUBLIC: the function wrote as the caller, so the caller needed blanket write
  access. Since the anon key is public, so did everyone else — anyone could set
  any listing's view_count to any value, and those counts feed landlord
  analytics and the host nav summary.

  THE DIRECT-UPSERT FALLBACK IS GONE. It existed for the window when the RPC
  might not have been deployed, and it is now not merely dead but actively
  wrong: the table's write grants were revoked, so the fallback would fail on
  permissions and log a misleading "View tracking failed" for a call that had
  already succeeded.

  Errors stay swallowed. A missed view count must never surface to a student
  reading a listing.
*/
export async function POST(request, { params }) {
  const { id } = await params;

  if (!id || !/^\d{7}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase.rpc('increment_listing_view', {
    p_listing_id: id,
    p_view_date: today,
  });

  if (error) {
    console.error('View tracking failed:', error);
  }

  return NextResponse.json({ tracked: true });
}
