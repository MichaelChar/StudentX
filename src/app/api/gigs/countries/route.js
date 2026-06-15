import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getGigCountry } from '@/lib/gigCountries';

/**
 * GET /api/gigs/countries — the country filter source.
 *
 * Returns the countries that currently have at least one active gig, each
 * enriched with display metadata (name, flag) from src/lib/gigCountries.js.
 * The filter renders one button per entry, so a newly-seeded country appears
 * automatically. Codes with no metadata are dropped (nothing to render).
 */
export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('gigs')
      .select('country_code')
      .eq('is_active', true);

    if (error) {
      console.error('Supabase gig countries query error:', error);
      return NextResponse.json({ error: 'Failed to fetch countries' }, { status: 500 });
    }

    const counts = new Map();
    for (const row of data ?? []) {
      const code = row.country_code;
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }

    const countries = [...counts.entries()]
      .map(([code, count]) => {
        const meta = getGigCountry(code);
        if (!meta) return null;
        return { code, name: meta.name, flag: meta.flag, count };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    const response = NextResponse.json({ countries });
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600'
    );
    return response;
  } catch (err) {
    console.error('Unexpected error in GET /api/gigs/countries:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
