import { createClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

/**
 * Fetch landlord and listing metrics from Supabase.
 */
export async function getSupabaseMetrics() {
  const supabase = getServiceSupabase();

  // Total landlords
  const { count: totalLandlords } = await supabase
    .from('landlords')
    .select('landlord_id', { count: 'exact', head: true });

  // Landlords with active paid subscriptions
  const { count: paidLandlords } = await supabase
    .from('subscriptions')
    .select('landlord_id', { count: 'exact', head: true })
    .in('status', ['active', 'trialing', 'past_due']);

  // Landlords by plan
  const { data: planBreakdown } = await supabase
    .from('subscriptions')
    .select('plan_id, status')
    .in('status', ['active', 'trialing', 'past_due']);

  const byPlan = {};
  for (const row of planBreakdown || []) {
    byPlan[row.plan_id] = (byPlan[row.plan_id] || 0) + 1;
  }

  // Total listings (no is_active column; all listed = active)
  const { count: totalListings } = await supabase
    .from('listings')
    .select('listing_id', { count: 'exact', head: true });

  // Featured listings
  const { count: featuredListings } = await supabase
    .from('listings')
    .select('listing_id', { count: 'exact', head: true })
    .eq('is_featured', true);

  // Inquiries this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count: inquiriesThisMonth } = await supabase
    .from('inquiries')
    .select('inquiry_id', { count: 'exact', head: true })
    .gte('created_at', monthStart);

  // Inquiries last month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const { count: inquiriesLastMonth } = await supabase
    .from('inquiries')
    .select('inquiry_id', { count: 'exact', head: true })
    .gte('created_at', lastMonthStart)
    .lt('created_at', monthStart);

  return {
    totalLandlords: totalLandlords || 0,
    paidLandlords: paidLandlords || 0,
    freeLandlords: (totalLandlords || 0) - (paidLandlords || 0),
    byPlan,
    totalListings: totalListings || 0,
    featuredListings: featuredListings || 0,
    inquiriesThisMonth: inquiriesThisMonth || 0,
    inquiriesLastMonth: inquiriesLastMonth || 0,
  };
}
