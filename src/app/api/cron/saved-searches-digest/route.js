import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import { digestEmailHtml, digestEmailSubject } from '@/templates/email/digest';
import { transformListing } from '@/lib/transformListing';

const LISTING_SELECT = `
  listing_id,
  is_featured,
  description,
  photos,
  min_duration_months,
  created_at,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name, contact_info, verified_tier, is_verified ),
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
  if (filters.minDuration && [1, 5, 9].includes(Number(filters.minDuration))) {
    query = query.lte('min_duration_months', Number(filters.minDuration));
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

// Process one frequency's saved searches. Returns aggregate stats. Factored
// out so a single cron invocation can run both daily and weekly back-to-back
// (e.g. on Mondays under the consolidated cron).
async function processFrequency(supabase, frequency, appUrl, resend) {
  // Fetch all active saved searches for this frequency
  const { data: searches, error: fetchError } = await supabase
    .from('saved_searches')
    .select('id, email, label, filters, unsubscribe_token, last_notified_at')
    .eq('is_active', true)
    .eq('frequency', frequency);

  if (fetchError) {
    console.error(`Failed to fetch ${frequency} saved searches:`, fetchError);
    return { processed: 0, emailsSent: 0, alreadyClaimed: 0, error: true };
  }

  if (!searches || searches.length === 0) {
    return { processed: 0, emailsSent: 0, alreadyClaimed: 0 };
  }

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
      const manageUrl = `${appUrl}/property/thessaloniki/alerts/manage?token=${search.unsubscribe_token}`;

      if (await isEmailSuppressed(search.email)) {
        console.warn(`[saved-search-digest] skipping send — ${search.email} is suppressed`);
        continue;
      }

      await resend.emails.send({
        from: 'StudentX Alerts <alerts@studentx.uk>',
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

  return { processed: searches.length, emailsSent, alreadyClaimed };
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Cron consolidation: we run on a single daily trigger (0 9 * * *) instead
  // of two separate triggers (one daily, one weekly), to stay under
  // Cloudflare's Free-plan limit of 5 cron triggers per Worker. When called
  // without an explicit `frequency` query param, process daily every day and
  // also process weekly on Mondays (UTC). An explicit `?frequency=...` value
  // overrides this — useful for manual curl invocations and for backward
  // compatibility with any legacy cron registration that still passes the
  // query string.
  const { searchParams } = new URL(request.url);
  const frequencyParam = searchParams.get('frequency');
  let frequenciesToProcess;
  if (frequencyParam === 'weekly') {
    frequenciesToProcess = ['weekly'];
  } else if (frequencyParam === 'daily') {
    frequenciesToProcess = ['daily'];
  } else {
    // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat. Coupling to keep in mind: the
    // cron trigger in wrangler.jsonc fires at 09:00 UTC, well away from the
    // day boundary, so "Monday in UTC at fire time" matches "Monday in
    // Europe/Athens at fire time" (11:00 EET / 12:00 EEST) all year round.
    // If you re-time this cron, re-check that the UTC-Monday window still
    // aligns with the intended user-perceived Monday. Note this also reads
    // the wall clock at request time, not at the scheduled fire time, so a
    // manual curl invocation across the UTC day boundary will see whichever
    // side it lands on — fine because claim_digest_send debounces any
    // duplicate weekly run within 6 days.
    const dayOfWeek = new Date().getUTCDay();
    frequenciesToProcess = dayOfWeek === 1 ? ['daily', 'weekly'] : ['daily'];
  }

  const supabase = getSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
  const resend = getResend();

  let totalProcessed = 0;
  let totalEmailsSent = 0;
  let totalAlreadyClaimed = 0;
  let sawError = false;

  for (const frequency of frequenciesToProcess) {
    const stats = await processFrequency(supabase, frequency, appUrl, resend);
    totalProcessed += stats.processed;
    totalEmailsSent += stats.emailsSent;
    totalAlreadyClaimed += stats.alreadyClaimed;
    if (stats.error) sawError = true;
  }

  if (sawError) {
    return NextResponse.json(
      {
        error: 'One or more frequencies failed to fetch',
        processed: totalProcessed,
        emailsSent: totalEmailsSent,
        alreadyClaimed: totalAlreadyClaimed,
        frequencies: frequenciesToProcess,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    processed: totalProcessed,
    emailsSent: totalEmailsSent,
    alreadyClaimed: totalAlreadyClaimed,
    frequencies: frequenciesToProcess,
  });
}
