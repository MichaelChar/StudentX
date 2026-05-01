import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';
import { getActiveSubscription } from '@/lib/stripe';

async function getLandlord(userId) {
  const { data } = await getSupabase()
    .from('landlords')
    .select('landlord_id, verified_tier, is_verified')
    .eq('auth_user_id', userId)
    .single();
  return data;
}

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlord = await getLandlord(user.id);
  if (!landlord) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const supabase = getSupabase();
  const subscription = await getActiveSubscription(supabase, landlord.landlord_id);

  const { count } = await supabase
    .from('listings')
    .select('listing_id', { count: 'exact', head: true })
    .eq('landlord_id', landlord.landlord_id);

  return NextResponse.json({
    subscription: subscription ? {
      id: subscription.subscription_id,
      status: subscription.status,
      billingInterval: subscription.billing_interval,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    } : null,
    verifiedTier: landlord.verified_tier || 'none',
    isVerified: landlord.is_verified === true,
    usage: {
      listingsCount: count || 0,
    },
  });
}
