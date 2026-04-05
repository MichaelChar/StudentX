import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';
import { getActiveSubscription, getEffectivePlan } from '@/lib/stripe';

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

  const supabase = getSupabase();
  const subscription = await getActiveSubscription(supabase, landlordId);
  const plan = await getEffectivePlan(supabase, landlordId);

  const { count } = await supabase
    .from('listings')
    .select('listing_id', { count: 'exact', head: true })
    .eq('landlord_id', landlordId);

  return NextResponse.json({
    subscription: subscription ? {
      id: subscription.subscription_id,
      status: subscription.status,
      billingInterval: subscription.billing_interval,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    } : null,
    plan: {
      planId: plan.plan_id,
      name: plan.name,
      maxListings: plan.max_listings,
      features: plan.features,
    },
    usage: {
      listingsUsed: count || 0,
      listingsMax: plan.max_listings,
    },
  });
}
