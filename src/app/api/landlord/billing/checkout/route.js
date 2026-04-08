import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';
import { getStripe, getOrCreateCustomer } from '@/lib/stripe';

async function getLandlord(userId) {
  const { data } = await getSupabase()
    .from('landlords')
    .select('landlord_id, name, email')
    .eq('auth_user_id', userId)
    .single();
  return data;
}

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlord = await getLandlord(user.id);
  if (!landlord) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const body = await request.json();
  const { tier, returnTo } = body;

  if (!tier || !['verified', 'verified_pro'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier. Must be "verified" or "verified_pro".' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get the plan and its Stripe price ID
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('plan_id', tier)
    .eq('is_active', true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const stripePriceId = plan.stripe_annual_price_id;
  if (!stripePriceId) {
    return NextResponse.json({ error: 'Plan not configured for Stripe billing' }, { status: 400 });
  }

  try {
    const customerId = await getOrCreateCustomer(supabase, landlord.landlord_id, landlord.email, landlord.name);
    const stripe = getStripe();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Build line items — add overage metered price for verified_pro
    const lineItems = [{ price: stripePriceId, quantity: 1 }];
    if (tier === 'verified_pro' && plan.stripe_overage_price_id) {
      lineItems.push({ price: plan.stripe_overage_price_id });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${siteUrl}/landlord/dashboard?billing=success`,
      cancel_url: returnTo === 'onboarding'
        ? `${siteUrl}/landlord/onboarding`
        : `${siteUrl}/landlord/dashboard?billing=cancelled`,
      metadata: {
        landlord_id: landlord.landlord_id,
        plan_id: tier,
        verified_tier: tier,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
