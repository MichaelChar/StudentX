import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseWithToken } from '@/lib/supabaseServer';

async function getLandlordId(userId) {
  const { data } = await getSupabase()
    .from('landlords')
    .select('landlord_id')
    .eq('auth_user_id', userId)
    .single();
  return data?.landlord_id ?? null;
}

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlordId = await getLandlordId(user.id);
  if (!landlordId) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const authedSupabase = getSupabaseWithToken(token);

  // Get landlord's listing IDs
  const { data: listings } = await authedSupabase
    .from('listings')
    .select('listing_id')
    .eq('landlord_id', landlordId);

  const listingIds = listings?.map((l) => l.listing_id) || [];

  if (listingIds.length === 0) {
    return NextResponse.json({
      analytics: {
        total_views: 0,
        total_inquiries: 0,
        conversion_rate: 0,
        views_last_30_days: 0,
        inquiries_last_30_days: 0,
        per_listing: [],
      },
    });
  }

  // Total views (all time)
  const { data: allViews } = await authedSupabase
    .from('listing_views')
    .select('listing_id, view_count')
    .in('listing_id', listingIds);

  // Views last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  const { data: recentViews } = await authedSupabase
    .from('listing_views')
    .select('listing_id, view_count')
    .in('listing_id', listingIds)
    .gte('view_date', cutoff);

  // All inquiries
  const { data: allInquiries } = await getSupabase()
    .from('inquiries')
    .select('listing_id, created_at')
    .in('listing_id', listingIds);

  // Aggregate per-listing
  const viewsByListing = {};
  const recentViewsByListing = {};
  const inquiriesByListing = {};
  const recentInquiriesByListing = {};

  for (const v of allViews || []) {
    viewsByListing[v.listing_id] = (viewsByListing[v.listing_id] || 0) + v.view_count;
  }
  for (const v of recentViews || []) {
    recentViewsByListing[v.listing_id] = (recentViewsByListing[v.listing_id] || 0) + v.view_count;
  }
  for (const inq of allInquiries || []) {
    inquiriesByListing[inq.listing_id] = (inquiriesByListing[inq.listing_id] || 0) + 1;
    if (inq.created_at >= cutoff) {
      recentInquiriesByListing[inq.listing_id] = (recentInquiriesByListing[inq.listing_id] || 0) + 1;
    }
  }

  const totalViews = Object.values(viewsByListing).reduce((s, v) => s + v, 0);
  const totalInquiries = allInquiries?.length || 0;
  const viewsLast30 = Object.values(recentViewsByListing).reduce((s, v) => s + v, 0);
  const inquiriesLast30 = Object.values(recentInquiriesByListing).reduce((s, v) => s + v, 0);
  const conversionRate = totalViews > 0 ? ((totalInquiries / totalViews) * 100) : 0;

  // Per-listing breakdown
  const perListing = listingIds.map((id) => ({
    listing_id: id,
    views: viewsByListing[id] || 0,
    views_30d: recentViewsByListing[id] || 0,
    inquiries: inquiriesByListing[id] || 0,
    inquiries_30d: recentInquiriesByListing[id] || 0,
    conversion: (viewsByListing[id] || 0) > 0
      ? (((inquiriesByListing[id] || 0) / viewsByListing[id]) * 100)
      : 0,
  }));

  return NextResponse.json({
    analytics: {
      total_views: totalViews,
      total_inquiries: totalInquiries,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      views_last_30_days: viewsLast30,
      inquiries_last_30_days: inquiriesLast30,
      per_listing: perListing,
    },
  });
}
