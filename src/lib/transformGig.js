import { getGigCountry } from '@/lib/gigCountries';

/**
 * Transforms a raw Supabase `gigs` row into the flat, public-safe shape the
 * Holiday Gigs API returns. Like transformListing, this feeds unauthenticated
 * surfaces, so the owner-only `contact_info` column is deliberately NOT exposed
 * — students reach the employer through the in-app gig inquiry flow.
 */
export function transformGig(row) {
  const country = getGigCountry(row.country_code);

  return {
    gig_id: row.gig_id,
    title: row.title ?? null,
    employer_name: row.employer_name ?? null,
    description: row.description ?? null,
    is_paid: row.is_paid ?? false,
    // pay_amount is the figure the histogram + card read. Null for unpaid gigs
    // and "pay on application" paid gigs.
    pay_amount: row.pay_amount != null ? Number(row.pay_amount) : null,
    pay_period: row.pay_period ?? 'month',
    currency: row.currency ?? 'EUR',
    country_code: row.country_code ?? null,
    country_name: country?.name ?? null,
    country_flag: country?.flag ?? null,
    city: row.city ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    available_from: row.available_from ?? null,
    min_duration_weeks: row.min_duration_weeks ?? null,
    photos: Array.isArray(row.photos) ? row.photos : [],
    created_at: row.created_at ?? null,
  };
}
