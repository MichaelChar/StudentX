import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { transformGig } from '@/lib/transformGig';
import { isKnownGigCountry } from '@/lib/gigCountries';

// Public-safe columns only — contact_info is omitted by both this SELECT and
// transformGig (owner-only PII; see transformGig.js).
const GIG_SELECT = `
  gig_id,
  title,
  employer_name,
  description,
  is_paid,
  pay_amount,
  pay_period,
  currency,
  country_code,
  city,
  lat,
  lng,
  available_from,
  min_duration_weeks,
  photos,
  created_at
`;

/**
 * GET /api/gigs — the Holiday Gigs board.
 *
 * Query params (all optional):
 *   pay=paid|unpaid     — the headline split (defaults to no filter)
 *   countries=GR,ES     — CSV of ISO-2 codes (unknown codes ignored)
 *   available_from=YYYY-MM-DD — gigs starting on/before this date
 *   min_duration=4      — gigs running at least this many weeks
 *
 * There is no sort control on the gigs board (issue Q-spec): results come back
 * newest-first as a stable default.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = getSupabase();

    let query = supabase.from('gigs').select(GIG_SELECT).eq('is_active', true);

    const pay = searchParams.get('pay');
    if (pay === 'paid') query = query.eq('is_paid', true);
    else if (pay === 'unpaid') query = query.eq('is_paid', false);
    else if (pay) {
      return NextResponse.json(
        { error: "pay must be 'paid' or 'unpaid'" },
        { status: 400 }
      );
    }

    const countriesRaw = searchParams.get('countries');
    if (countriesRaw) {
      const codes = countriesRaw
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c && isKnownGigCountry(c));
      // All requested codes unknown → nothing to show.
      if (codes.length === 0) {
        return cachedJson({ gigs: [] });
      }
      query = query.in('country_code', codes);
    }

    const availableFrom = searchParams.get('available_from');
    if (availableFrom) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(availableFrom)) {
        return NextResponse.json(
          { error: 'available_from must be YYYY-MM-DD' },
          { status: 400 }
        );
      }
      // Gig must start on or before the date the student is free.
      query = query.lte('available_from', availableFrom);
    }

    const minDuration = searchParams.get('min_duration');
    if (minDuration) {
      const weeks = Number(minDuration);
      if (!Number.isFinite(weeks) || weeks < 0) {
        return NextResponse.json(
          { error: 'min_duration must be a non-negative number' },
          { status: 400 }
        );
      }
      query = query.gte('min_duration_weeks', weeks);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error('Supabase gigs query error:', error);
      return NextResponse.json({ error: 'Failed to fetch gigs' }, { status: 500 });
    }

    return cachedJson({ gigs: (data ?? []).map(transformGig) });
  } catch (err) {
    console.error('Unexpected error in GET /api/gigs:', err);
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
