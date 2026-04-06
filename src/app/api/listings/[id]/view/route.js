import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function POST(request, { params }) {
  const { id } = await params;

  if (!id || !/^\d{7}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  // Upsert: increment today's counter or create with 1
  const { error } = await supabase.rpc('increment_listing_view', {
    p_listing_id: id,
    p_view_date: today,
  });

  // Fallback if RPC doesn't exist: try direct upsert
  if (error) {
    const { error: upsertError } = await supabase
      .from('listing_views')
      .upsert(
        { listing_id: id, view_date: today, view_count: 1 },
        { onConflict: 'listing_id,view_date', ignoreDuplicates: false }
      );

    if (upsertError) {
      // Silently fail — view tracking should not block the user
      console.error('View tracking failed:', upsertError);
    }
  }

  return NextResponse.json({ tracked: true });
}
