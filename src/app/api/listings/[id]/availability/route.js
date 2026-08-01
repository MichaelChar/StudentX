import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { parseISODate } from '@/lib/bookingDates';

/**
 * Public calendar data for a listing: availability blocks in a window.
 * GET /api/listings/[id]/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id || !/^\d[\d-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid listing ID format' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const fromRaw = searchParams.get('from');
    const toRaw = searchParams.get('to');
    if (fromRaw && !parseISODate(fromRaw)) {
      return NextResponse.json(
        { error: 'from must be a valid YYYY-MM-DD date' },
        { status: 400 },
      );
    }
    if (toRaw && !parseISODate(toRaw)) {
      return NextResponse.json(
        { error: 'to must be a valid YYYY-MM-DD date' },
        { status: 400 },
      );
    }

    let query = getSupabase()
      .from('listing_availability_blocks')
      .select('block_id, start_date, end_date, kind')
      .eq('listing_id', id)
      .order('start_date', { ascending: true });

    // Overlap with [from, to]: start <= to AND end >= from
    if (toRaw) query = query.lte('start_date', toRaw);
    if (fromRaw) query = query.gte('end_date', fromRaw);

    const { data, error } = await query;
    if (error) {
      console.error('availability query error:', error);
      return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
    }

    const response = NextResponse.json({
      listing_id: id,
      blocks: data || [],
    });
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    );
    return response;
  } catch (err) {
    console.error('Unexpected error in GET availability:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
