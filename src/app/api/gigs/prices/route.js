import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isKnownGigCountry } from '@/lib/gigCountries';

/**
 * GET /api/gigs/prices — pay figures for the paid-gig histogram.
 *
 * The histogram is paid-only (issue Q2), so this always restricts to paid gigs
 * with a pay_amount. It honours the same country / availability / duration
 * filters as the board (so the distribution matches what's on screen) but, like
 * the property price-distribution route, returns the raw figures and lets the
 * client bucket them via src/lib/priceHistogram.js.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = getSupabase();

    let query = supabase
      .from('gigs')
      .select('pay_amount')
      .eq('is_active', true)
      .eq('is_paid', true)
      .not('pay_amount', 'is', null);

    const countriesRaw = searchParams.get('countries');
    if (countriesRaw) {
      const codes = countriesRaw
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c && isKnownGigCountry(c));
      if (codes.length === 0) return cachedJson({ prices: [] });
      query = query.in('country_code', codes);
    }

    const availableFrom = searchParams.get('available_from');
    if (availableFrom && /^\d{4}-\d{2}-\d{2}$/.test(availableFrom)) {
      query = query.lte('available_from', availableFrom);
    }

    const minDuration = searchParams.get('min_duration');
    if (minDuration) {
      const weeks = Number(minDuration);
      if (Number.isFinite(weeks) && weeks >= 0) {
        query = query.gte('min_duration_weeks', weeks);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('Supabase gig prices query error:', error);
      return NextResponse.json({ error: 'Failed to fetch gig prices' }, { status: 500 });
    }

    const prices = (data ?? [])
      .map((r) => (r.pay_amount != null ? Number(r.pay_amount) : null))
      .filter((p) => Number.isFinite(p));

    return cachedJson({ prices });
  } catch (err) {
    console.error('Unexpected error in GET /api/gigs/prices:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function cachedJson(body) {
  const response = NextResponse.json(body);
  response.headers.set(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=600'
  );
  return response;
}
