import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import { digestEmailHtml, digestEmailSubject } from '@/templates/email/digest';
import { transformListing } from '@/lib/transformListing';

const LISTING_SELECT = `
  listing_id,
  is_featured,
  description,
  photos,
  created_at,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name, contact_info, verified_tier ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Support both header and query-param auth
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === secret;
}

async function fetchMatchingListings(supabase, filters, since) {
  let query = supabase.from('listings').select(LISTING_SELECT);

  if (since) {
    query = query.gte('created_at', since);
  }

  if (filters.faculty) {
    query = query.eq('faculty_distances.faculty_id', filters.faculty);
  }
  if (filters.minBudget) {
    query = query.gte('rent.monthly_price', Number(filters.minBudget));
  }
  if (filters.maxBudget) {
    query = query.lte('rent.monthly_price', Number(filters.maxBudget));
  }
  if (filters.neighborhoods?.length > 0) {
    query = query.in('location.neighborhood', filters.neighborhoods);
  }
  if (filters.types?.length > 0) {
    query = query.in('property_types.name', filters.types);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let results = data.map(transformListing);

  // Client-side amenity filter (requires ALL selected)
  if (filters.amenities?.length > 0) {
    results = results.filter((l) => {
      const has = (l.amenities || []).map((a) => a.toLowerCase());
      return filters.amenities.every((a) => has.includes(a.toLowerCase()));
    });
  }

  return results;
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const frequency = searchParams.get('frequency') === 'weekly' ? 'weekly' : 'daily';

  const supabase = getSupabase();

  // Fetch all active saved searches for this frequency
  const { data: searches, error: fetchError } = await supabase
    .from('saved_searches')
    .select('id, email, label, filters, unsubscribe_token, last_notified_at')
    .eq('is_active', true)
    .eq('frequency', frequency);

  if (fetchError) {
    console.error('Failed to fetch saved searches:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch saved searches' }, { status: 500 });
  }

  if (!searches || searches.length === 0) {
    return NextResponse.json({ processed: 0, emailsSent: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.gr';
  const resend = getResend();
  let emailsSent = 0;
  let alreadyClaimed = 0;
  // Min interval per frequency. Slightly tighter than the full period so a
  // cron that runs a few minutes late never gets blocked by its own previous
  // run, but still wide enough that a retry within seconds/minutes is rejected.
  const minInterval = frequency === 'weekly' ? '6 days' : '20 hours';

  for (const search of searches) {
    try {
      const since = search.last_notified_at;
      const matches = await fetchMatchingListings(supabase, search.filters || {}, since);

      if (matches.length === 0) continue;

      // Claim the send BEFORE calling Resend. The RPC's conditional UPDATE
      // ensures only one caller per (saved_search, period) advances
      // last_notified_at; concurrent or retried callers get false and skip.
      // See supabase/migrations/022_claim_digest_send.sql.
      const { data: claimed, error: claimError } = await supabase.rpc('claim_digest_send', {
        p_saved_search_id: search.id,
        p_min_interval: minInterval,
      });

      if (claimError) {
        console.error(`claim_digest_send failed for ${search.id}:`, claimError);
        continue;
      }
      if (!claimed) {
        // Another invocation already claimed this period — skip silently.
        alreadyClaimed++;
        continue;
      }

      // From here on: the claim is committed. If Resend throws, this digest
      // is lost for this period (no resend on retry). For digests this is
      // the right tradeoff: missing one digest beats double-sending.
      const manageUrl = `${appUrl}/alerts/manage?token=${search.unsubscribe_token}`;

      await resend.emails.send({
        from: 'StudentX Alerts <alerts@updates.studentx.gr>',
        to: search.email,
        subject: digestEmailSubject(search.label, matches.length),
        html: digestEmailHtml({
          label: search.label,
          listings: matches,
          manageUrl,
          appUrl,
        }),
      });

      emailsSent++;
    } catch (err) {
      console.error(`Error processing saved search ${search.id}:`, err);
      // Continue with next search
    }
  }

  return NextResponse.json({ processed: searches.length, emailsSent, alreadyClaimed });
}
